import { expect, test } from 'bun:test';
import { createOutbox } from '@ilokesto/state';
import type { OutboxContext, OutboxRecord, OutboxResponse } from '@ilokesto/state';
import type { PersistedValue, PersistStorageFactory } from '@ilokesto/state/middleware';
import { deferred } from './helpers/persistStorage';

type Operation = { readonly amount: number };
type Conflict = { readonly amount: number };
const decode = (value: unknown): Operation | null =>
  typeof value === 'object' && value !== null && 'amount' in value &&
  typeof value.amount === 'number' && Number.isFinite(value.amount)
    ? { amount: value.amount } : null;

function durableStorage() {
  const values = new Map<string, PersistedValue>();
  let failAck = false;
  const factory: PersistStorageFactory = () => ({
    async getItem(key) { return structuredClone(values.get(key) ?? null); },
    async setItem(key, value) {
      if (failAck && Array.isArray(value.state) && value.state.length === 0) {
        throw new Error('ACK commit unavailable');
      }
      values.set(key, structuredClone(value));
    },
    async removeItem(key) { values.delete(key); },
  });
  return { factory, values, rejectAck: (value: boolean) => { failAck = value; } };
}

function httpTransport(url: URL, account: string) {
  return async (
    record: OutboxRecord<Operation>, { signal }: OutboxContext,
  ): Promise<OutboxResponse<Conflict>> => {
    const response = await fetch(new URL(`/accounts/${account}`, url), {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': record.id },
      body: JSON.stringify(record.operation),
    });
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('id' in body) || typeof body.id !== 'string') {
      throw new Error('Invalid response ID');
    }
    if (response.status === 409 && 'conflict' in body) {
      const conflict = decode(body.conflict);
      if (conflict) return { status: 'conflict', id: body.id, conflict };
    }
    if (response.ok && 'status' in body && body.status === 'ack') {
      return { status: 'ack', id: body.id };
    }
    throw new Error(`HTTP ${response.status}`);
  };
}

test('HTTP outbox: ACK storage failure then offline restart -> replays same identity and server applies once', async () => {
  const storage = durableStorage();
  const delivered: string[] = [];
  const applied = new Set<string>();
  let total = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(request) {
      const id = request.headers.get('Idempotency-Key');
      const operation = decode(await request.json());
      if (!id || !operation) return new Response(null, { status: 400 });
      delivered.push(id);
      if (!applied.has(id)) {
        applied.add(id);
        total += operation.amount;
      }
      return Response.json({ status: 'ack', id });
    },
  });
  const options = {
    key: 'account:alice:outbox', storage: storage.factory, decode,
    transport: httpTransport(server.url, 'alice'),
  };
  const first = createOutbox(options);
  const restarted = createOutbox({ ...options, online: false });
  try {
    await first.rehydrate();
    await first.enqueue({ id: 'purchase-1', operation: { amount: 7 } });
    storage.rejectAck(true);
    expect(await first.flush()).toMatchObject({ status: 'error', error: { code: 'STORAGE' } });
    first.dispose();
    storage.rejectAck(false);

    await restarted.rehydrate();
    expect((await restarted.flush()).status).toBe('cancelled');
    expect(delivered).toEqual(['purchase-1']);
    restarted.setOnline(true);
    expect((await restarted.flush()).status).toBe('success');

    expect(delivered).toEqual(['purchase-1', 'purchase-1']);
    expect(total).toBe(7);
    expect(storage.values.get(options.key)).toEqual({ state: [], version: 0 });
    expect(restarted.store.getState().entries).toEqual([]);
  } finally {
    first.dispose();
    restarted.dispose();
    await server.stop(true);
  }
});

test('HTTP outbox: explicit conflict resolution -> saves a new identity before sending the revised operation', async () => {
  const storage = durableStorage();
  const received: Array<{ id: string; amount: number }> = [];
  const key = 'account:alice:outbox';
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(request) {
      const id = request.headers.get('Idempotency-Key');
      const operation = decode(await request.json());
      if (!id || !operation) return new Response(null, { status: 400 });
      received.push({ id, amount: operation.amount });
      expect(storage.values.get(key)).toEqual({ state: [{ id, operation }], version: 0 });
      if (operation.amount === 1) {
        return Response.json({ id, conflict: { amount: 2 } }, { status: 409 });
      }
      return Response.json({ status: 'ack', id });
    },
  });
  const outbox = createOutbox({
    key, storage: storage.factory, decode, transport: httpTransport(server.url, 'alice'),
    resolve: (_record, conflict) => ({
      action: 'replace', record: { id: 'resolved-2', operation: conflict },
    }),
  });
  try {
    await outbox.rehydrate();
    await outbox.enqueue({ id: 'original-1', operation: { amount: 1 } });

    expect((await outbox.flush()).status).toBe('success');
    expect(received).toEqual([{ id: 'original-1', amount: 1 }]);
    expect(storage.values.get(key)).toEqual({
      state: [{ id: 'resolved-2', operation: { amount: 2 } }], version: 0,
    });
    expect((await outbox.flush()).status).toBe('success');

    expect(received).toEqual([{ id: 'original-1', amount: 1 }, { id: 'resolved-2', amount: 2 }]);
    expect(storage.values.get(key)).toEqual({ state: [], version: 0 });
  } finally {
    outbox.dispose();
    await server.stop(true);
  }
});

test('HTTP outbox: dispose during account switch -> aborts old transport without leaking or deleting old account work', async () => {
  const storage = durableStorage();
  const receivedOld = deferred<void>();
  const releaseOld = deferred<void>();
  const returnedOld = deferred<void>();
  const delivered: string[] = [];
  const applied = new Set<string>();
  let holdOld = true;
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(request) {
      const id = request.headers.get('Idempotency-Key');
      const operation = decode(await request.json());
      if (!id || !operation) return new Response(null, { status: 400 });
      const identity = `${new URL(request.url).pathname}:${id}`;
      delivered.push(identity);
      applied.add(identity);
      if (identity === '/accounts/alice:alice-1' && holdOld) {
        receivedOld.resolve();
        await releaseOld.promise;
        returnedOld.resolve();
      }
      return Response.json({ status: 'ack', id });
    },
  });
  let oldSignal: AbortSignal | undefined;
  const sendOld = httpTransport(server.url, 'alice');
  const oldOptions = { key: 'account:alice:outbox', storage: storage.factory, decode };
  const alice = createOutbox({
    ...oldOptions,
    transport(record, context) { oldSignal = context.signal; return sendOld(record, context); },
  });
  const bob = createOutbox({
    key: 'account:bob:outbox', storage: storage.factory, decode,
    transport: httpTransport(server.url, 'bob'),
  });
  const restoredAlice = createOutbox({ ...oldOptions, transport: sendOld });
  try {
    await alice.rehydrate();
    await alice.enqueue({ id: 'alice-1', operation: { amount: 1 } });
    const original = alice.flush();
    await receivedOld.promise;

    alice.dispose();
    expect((await original).status).toBe('cancelled');
    expect(oldSignal?.aborted).toBe(true);
    await bob.rehydrate();
    await bob.enqueue({ id: 'bob-1', operation: { amount: 2 } });
    expect((await bob.flush()).status).toBe('success');
    holdOld = false;
    releaseOld.resolve();
    await returnedOld.promise;
    expect(storage.values.get(oldOptions.key)).toEqual({
      state: [{ id: 'alice-1', operation: { amount: 1 } }], version: 0,
    });
    await restoredAlice.rehydrate();
    expect((await restoredAlice.flush()).status).toBe('success');

    expect(delivered).toEqual(['/accounts/alice:alice-1', '/accounts/bob:bob-1', '/accounts/alice:alice-1']);
    expect(applied.size).toBe(2);
    expect(storage.values.get('account:bob:outbox')).toEqual({ state: [], version: 0 });
    expect(storage.values.get(oldOptions.key)).toEqual({ state: [], version: 0 });
  } finally {
    releaseOld.resolve();
    alice.dispose();
    bob.dispose();
    restoredAlice.dispose();
    await server.stop(true);
  }
});
