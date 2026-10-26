import { expect, jest, test } from 'bun:test';
import { createOutbox, OutboxError } from '@ilokesto/state';
import type { OutboxOptions, OutboxRecord, OutboxResponse, ResourceResult } from '@ilokesto/state';
import { AsyncMemoryStorage, deferred } from './helpers/persistStorage';

type Operation = { readonly amount: number };
const decode = (value: unknown): Operation | null =>
  typeof value === 'object' && value !== null && 'amount' in value &&
  typeof value.amount === 'number' && Number.isFinite(value.amount)
    ? { amount: value.amount } : null;
const operation = (id = 'one', amount = 1): OutboxRecord<Operation> => ({ id, operation: { amount } });
const ack = (record: OutboxRecord<Operation>): OutboxResponse => ({ status: 'ack', id: record.id });
function setup(overrides: Partial<OutboxOptions<Operation>> = {}) {
  const storage = new AsyncMemoryStorage();
  const sent: string[] = [];
  const outbox = createOutbox({
    key: 'account:one:outbox', decode, storage: () => storage,
    transport(record) { sent.push(record.id); return ack(record); },
    ...overrides,
  });
  return { outbox, storage, sent };
}

test('createOutbox: unopened instance -> requires hydration and performs no storage or transport work', async () => {
  const { outbox, storage, sent } = setup();

  await expect(outbox.enqueue(operation())).rejects.toMatchObject({ code: 'NOT_READY' });
  expect(await outbox.flush()).toMatchObject({ status: 'error', error: { code: 'NOT_READY' } });

  expect(storage.reads).toBe(0);
  expect(storage.writes).toEqual([]);
  expect(sent).toEqual([]);
  expect('set' in outbox.store).toBe(false);
  expect(outbox.store.getInitialState()).toEqual({
    hydration: 'idle', online: true, disposed: false, entries: [], error: null,
  });
  outbox.dispose();
});

test('createOutbox: invalid key or retry policy -> rejects configuration without opening storage', () => {
  for (const key of ['', '   ']) {
    expect(() => setup({ key })).toThrow(TypeError);
  }
  for (const maxAttempts of [0, -1, 1.5, Infinity, NaN]) {
    expect(() => setup({ retry: { maxAttempts } })).toThrow(RangeError);
  }
  for (const delayMs of [-1, Infinity, NaN, 2_147_483_648]) {
    expect(() => setup({ retry: { maxAttempts: 2, delayMs } })).toThrow(RangeError);
  }
});

for (const state of [
  {}, [null], [{ id: '', operation: { amount: 1 } }], [{ id: 'one' }],
  [{ id: 'one', operation: { amount: 'wrong' } }], [operation(), operation()],
]) {
  test(`rehydrate: invalid stored queue ${JSON.stringify(state)} -> rejects without overwriting or sending`, async () => {
    const { outbox, storage, sent } = setup();
    storage.value = { state, version: 0 };

    await expect(outbox.rehydrate()).rejects.toMatchObject({ code: 'INVALID_DATA' });

    expect(outbox.store.getState().hydration).toBe('error');
    expect(outbox.store.getState().entries).toEqual([]);
    expect(storage.writes).toEqual([]);
    expect(sent).toEqual([]);
    outbox.dispose();
  });
}

test('rehydrate: failed read then recovery -> shares attempts and restores pending records without sending', async () => {
  const { outbox, storage, sent } = setup({ online: false });
  const failure = new Error('unavailable');
  storage.getItem = async () => { throw failure; };
  const first = outbox.rehydrate();
  expect(outbox.rehydrate()).toBe(first);
  await expect(first).rejects.toMatchObject({ code: 'STORAGE', cause: failure });
  storage.getItem = async () => ({ state: [operation()], version: 0 });

  await outbox.rehydrate();

  expect(outbox.store.getState()).toMatchObject({
    hydration: 'ready', entries: [{ id: 'one', status: 'pending', attempts: 0 }],
  });
  expect((await outbox.flush()).status).toBe('cancelled');
  outbox.setOnline(true);
  expect(sent).toEqual([]);
  expect((await outbox.flush()).status).toBe('success');
  expect(sent).toEqual(['one']);
  outbox.dispose();
});

test('rehydrate: sparse stored queue -> rejects the missing record at the persistence boundary', async () => {
  const { outbox, storage, sent } = setup();
  storage.value = { state: new Array(1), version: 0 };

  await expect(outbox.rehydrate()).rejects.toMatchObject({ code: 'INVALID_DATA' });

  expect(outbox.store.getState().entries).toEqual([]);
  expect(storage.writes).toEqual([]);
  expect(sent).toEqual([]);
  outbox.dispose();
});

test('enqueue: invalid operation or duplicate ID -> preserves the accepted durable record', async () => {
  const { outbox, storage } = setup();
  await outbox.rehydrate();
  await outbox.enqueue(operation());

  await expect(outbox.enqueue(operation('one', 2))).rejects.toMatchObject({ code: 'DUPLICATE_ID' });
  await expect(outbox.enqueue(operation('two', NaN))).rejects.toMatchObject({ code: 'INVALID_RECORD' });

  expect(storage.value).toEqual({ state: [operation()], version: 0 });
  expect(outbox.store.getState().entries).toHaveLength(1);
  await outbox.flush();
  await expect(outbox.enqueue(operation())).rejects.toMatchObject({ code: 'DUPLICATE_ID' });
  outbox.dispose();
});

test('enqueue: initial storage failure -> never sends unsaved work and permits explicit enqueue recovery', async () => {
  const { outbox, storage, sent } = setup();
  await outbox.rehydrate();
  const failure = new Error('disk full');
  storage.setItem = async () => { throw failure; };

  await expect(outbox.enqueue(operation())).rejects.toMatchObject({ code: 'STORAGE', cause: failure });
  await outbox.flush();

  expect(sent).toEqual([]);
  expect(outbox.store.getState().entries).toEqual([]);
  expect(outbox.store.getState().error).toMatchObject({ code: 'STORAGE' });
  storage.setItem = async (_key, value) => { storage.value = value; };
  await outbox.enqueue(operation());
  await outbox.flush();
  expect(sent).toEqual(['one']);
  outbox.dispose();
});

test('flush: enqueue and ACK writes are deferred -> persists before send and removes only after durable ACK', async () => {
  const saving = deferred<void>();
  const saved = deferred<void>();
  const sending = deferred<void>();
  const response = deferred<OutboxResponse>();
  const removing = deferred<void>();
  const removed = deferred<void>();
  const { outbox, storage } = setup({
    transport() { sending.resolve(); return response.promise; },
  });
  storage.setItem = async (_key, value) => {
    if (storage.writes.length === 0) {
      storage.writes.push(value);
      saving.resolve();
      await saved.promise;
    } else {
      storage.writes.push(value);
      removing.resolve();
      await removed.promise;
    }
    storage.value = value;
  };
  await outbox.rehydrate();
  const enqueued = outbox.enqueue(operation());
  await saving.promise;
  const flushed = outbox.flush();
  expect(outbox.flush()).toBe(flushed);
  expect(outbox.store.getState().entries).toEqual([]);

  saved.resolve();
  await enqueued;
  await sending.promise;
  expect(storage.value).toEqual({ state: [operation()], version: 0 });
  expect(outbox.store.getState().entries[0].status).toBe('inflight');
  response.resolve(ack(operation()));
  await removing.promise;
  expect(outbox.store.getState().entries[0].id).toBe('one');
  expect(storage.value).toEqual({ state: [operation()], version: 0 });
  removed.resolve();

  expect((await flushed).status).toBe('success');
  expect(storage.value).toEqual({ state: [], version: 0 });
  expect(outbox.store.getState().entries).toEqual([]);
  outbox.dispose();
});

test('flush: server ACK then storage failure -> retains failed record and redelivers its original ID', async () => {
  const { outbox, storage, sent } = setup();
  await outbox.rehydrate();
  await outbox.enqueue(operation());
  storage.setItem = async () => { throw new Error('ACK disk failure'); };

  expect(await outbox.flush()).toMatchObject({ status: 'error', error: { code: 'STORAGE' } });

  expect(outbox.store.getState().entries).toMatchObject([{ id: 'one', status: 'error', attempts: 1 }]);
  expect(storage.value).toEqual({ state: [operation()], version: 0 });
  storage.setItem = async (_key, value) => { storage.value = value; };
  expect((await outbox.flush()).status).toBe('success');
  expect(sent).toEqual(['one', 'one']);
  expect(storage.value).toEqual({ state: [], version: 0 });
  outbox.dispose();
});

test('flush: transport failure without retry configuration -> stops after one attempt and retains later work', async () => {
  let calls = 0;
  const failure = new Error('offline');
  const { outbox } = setup({ transport() { calls += 1; throw failure; } });
  await outbox.rehydrate();
  await outbox.enqueue(operation());
  await outbox.enqueue(operation('two'));

  expect(await outbox.flush()).toEqual({ status: 'error', error: failure });

  expect(calls).toBe(1);
  expect(outbox.store.getState().entries.map(entry => entry.status)).toEqual(['error', 'pending']);
  outbox.dispose();
});

test('flush: bounded retry with backoff -> retries only at the requested times and stops at the limit', async () => {
  jest.useFakeTimers();
  const firstBackoff = deferred<void>();
  const secondBackoff = deferred<void>();
  let calls = 0;
  const failure = new Error('offline');
  const { outbox } = setup({
    retry: { maxAttempts: 3, delayMs: attempt => attempt * 100 },
    transport() { calls += 1; throw failure; },
  });
  outbox.store.subscribe(() => {
    const entry = outbox.store.getState().entries[0];
    if (entry?.status === 'error' && entry.attempts === 1) firstBackoff.resolve();
    if (entry?.status === 'error' && entry.attempts === 2) secondBackoff.resolve();
  });
  try {
    await outbox.rehydrate();
    await outbox.enqueue(operation());
    const result = outbox.flush();
    await firstBackoff.promise;

    jest.advanceTimersByTime(99);
    expect(calls).toBe(1);
    jest.advanceTimersByTime(1);
    await secondBackoff.promise;
    jest.advanceTimersByTime(199);
    expect(calls).toBe(2);
    jest.advanceTimersByTime(1);

    expect(await result).toEqual({ status: 'error', error: failure });
    expect(calls).toBe(3);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    outbox.dispose();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('cancel: pending backoff -> clears its timer and leaves the durable queue available for manual replay', async () => {
  jest.useFakeTimers();
  const waiting = deferred<void>();
  let calls = 0;
  const { outbox, storage } = setup({
    retry: { maxAttempts: 3, delayMs: 100 },
    transport(record) { if (++calls === 1) throw new Error('retry'); return ack(record); },
  });
  outbox.store.subscribe(() => {
    if (outbox.store.getState().entries[0]?.status === 'error') waiting.resolve();
  });
  try {
    await outbox.rehydrate();
    await outbox.enqueue(operation());
    const result = outbox.flush();
    await waiting.promise;

    outbox.cancel('manual');

    expect(await result).toEqual({ status: 'cancelled', reason: 'manual' });
    expect(jest.getTimerCount()).toBe(0);
    expect(storage.value).toEqual({ state: [operation()], version: 0 });
    expect((await outbox.flush()).status).toBe('success');
    expect(calls).toBe(2);
  } finally {
    outbox.dispose();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('flush: mismatched ACK -> retains operation without retrying a protocol failure', async () => {
  let calls = 0;
  const { outbox, storage } = setup({
    retry: { maxAttempts: 3 },
    transport() { calls += 1; return { status: 'ack', id: 'another' }; },
  });
  await outbox.rehydrate();
  await outbox.enqueue(operation());

  expect(await outbox.flush()).toMatchObject({ status: 'error', error: { code: 'INVALID_RESPONSE' } });

  expect(calls).toBe(1);
  expect(storage.value).toEqual({ state: [operation()], version: 0 });
  outbox.dispose();
});

for (const decision of ['missing', 'keep', 'discard'] as const) {
  test(`flush: conflict resolver ${decision} -> ${decision === 'discard' ? 'explicitly removes' : 'retains'} the operation`, async () => {
    const conflict = { serverVersion: 2 };
    const { outbox, storage } = setup({
      transport: record => ({ status: 'conflict', id: record.id, conflict }),
      resolve: decision === 'missing' ? undefined : (record, received, { signal, key }) => {
        expect(record).toEqual(operation());
        expect(received).toEqual(conflict);
        expect(signal.aborted).toBe(false);
        expect(key).toBe('account:one:outbox');
        return { action: decision };
      },
    });
    await outbox.rehydrate();
    await outbox.enqueue(operation());

    const result = await outbox.flush();

    if (decision === 'discard') {
      expect(result.status).toBe('success');
      expect(storage.value).toEqual({ state: [], version: 0 });
    } else {
      expect(result).toMatchObject({ status: 'error', error: { code: 'CONFLICT', cause: conflict } });
      expect(storage.value).toEqual({ state: [operation()], version: 0 });
    }
    outbox.dispose();
  });
}

test('flush: deferred conflict replacement with newer work -> atomically replaces with fresh ID and preserves newer enqueue', async () => {
  const resolving = deferred<void>();
  const resolution = deferred<{ action: 'replace'; record: OutboxRecord<Operation> }>();
  const sent: string[] = [];
  const { outbox, storage } = setup({
    transport(record) {
      sent.push(record.id);
      return record.id === 'one' ? { status: 'conflict', id: record.id, conflict: 2 } : ack(record);
    },
    resolve() { resolving.resolve(); return resolution.promise; },
  });
  await outbox.rehydrate();
  await outbox.enqueue(operation());
  const result = outbox.flush();
  await resolving.promise;
  await outbox.enqueue(operation('two', 2));

  resolution.resolve({ action: 'replace', record: operation('replacement', 3) });

  expect((await result).status).toBe('success');
  expect(storage.value).toEqual({ state: [operation('replacement', 3), operation('two', 2)], version: 0 });
  expect(sent).toEqual(['one']);
  expect((await outbox.flush()).status).toBe('success');
  expect(sent).toEqual(['one', 'replacement', 'two']);
  outbox.dispose();
});

test('flush: conflict replacement reuses ID -> rejects rather than sending a changed payload with old identity', async () => {
  const { outbox, storage } = setup({
    transport: record => ({ status: 'conflict', id: record.id, conflict: null }),
    resolve: record => ({ action: 'replace', record: operation(record.id, 2) }),
  });
  await outbox.rehydrate();
  await outbox.enqueue(operation());

  expect(await outbox.flush()).toMatchObject({ status: 'error', error: { code: 'DUPLICATE_ID' } });

  expect(storage.value).toEqual({ state: [operation()], version: 0 });
  outbox.dispose();
});

test('flush: newer enqueue during transport -> ACK removes only its own record from the latest queue', async () => {
  const started = deferred<void>();
  const response = deferred<OutboxResponse>();
  const { outbox, storage } = setup({
    transport() { started.resolve(); return response.promise; },
  });
  await outbox.rehydrate();
  await outbox.enqueue(operation());
  const result = outbox.flush();
  await started.promise;
  await outbox.enqueue(operation('two', 2));

  response.resolve(ack(operation()));

  expect((await result).status).toBe('success');
  expect(storage.value).toEqual({ state: [operation('two', 2)], version: 0 });
  expect(outbox.store.getState().entries).toMatchObject([{ id: 'two', status: 'pending' }]);
  outbox.dispose();
});

for (const action of ['cancel', 'dispose'] as const) {
  test(`flush: inflight observer calls ${action} -> skips transport invocation`, async () => {
    const { outbox, storage, sent } = setup();
    await outbox.rehydrate();
    await outbox.enqueue(operation());
    outbox.store.subscribe(() => {
      if (outbox.store.getState().entries[0]?.status === 'inflight') outbox[action]();
    });

    expect((await outbox.flush()).status).toBe('cancelled');

    expect(sent).toEqual([]);
    expect(storage.value).toEqual({ state: [operation()], version: 0 });
    outbox.dispose();
  });
}

test('cancel: abort listener starts replacement flush -> late old response cannot remove or fail newer work', async () => {
  const started = deferred<void>();
  const original = deferred<OutboxResponse>();
  const replacementResponse = deferred<OutboxResponse>();
  let replacement: Promise<ResourceResult<void>> | undefined;
  let calls = 0;
  const { outbox, storage } = setup({
    transport(_record, { signal }) {
      if (++calls === 1) {
        signal.addEventListener('abort', () => { replacement = outbox.flush(); }, { once: true });
        started.resolve();
        return original.promise;
      }
      return replacementResponse.promise;
    },
  });
  await outbox.rehydrate();
  await outbox.enqueue(operation());
  const first = outbox.flush();
  await started.promise;

  outbox.cancel('replace');
  original.resolve(ack(operation()));
  await original.promise;
  expect(await first).toEqual({ status: 'cancelled', reason: 'replace' });
  expect(storage.value).toEqual({ state: [operation()], version: 0 });
  replacementResponse.resolve(ack(operation()));

  expect((await replacement)?.status).toBe('success');
  expect(calls).toBe(2);
  expect(outbox.store.getState().entries).toEqual([]);
  outbox.dispose();
});

test('flush: observer enqueues after ACK -> leaves newer work for the next finite flush', async () => {
  const { outbox, storage, sent } = setup();
  await outbox.rehydrate();
  await outbox.enqueue(operation());
  let enqueued: Promise<void> | undefined;
  let appended = false;
  outbox.store.subscribe(() => {
    if (!appended && outbox.store.getState().entries.length === 0) {
      appended = true;
      enqueued = outbox.enqueue(operation('two', 2));
    }
  });

  expect((await outbox.flush()).status).toBe('success');
  await enqueued;

  expect(sent).toEqual(['one']);
  expect(storage.value).toEqual({ state: [operation('two', 2)], version: 0 });
  outbox.dispose();
});

test('enqueue: caller snapshot and transport mutate copies -> replay retains the original durable operation', async () => {
  const input = { id: 'one', operation: { amount: 1 } };
  const observed: number[] = [];
  const { outbox, storage } = setup({
    transport(record) {
      observed.push(record.operation.amount);
      Object.assign(record.operation, { amount: 100 });
      throw new Error('lost response');
    },
  });
  await outbox.rehydrate();
  const enqueued = outbox.enqueue(input);
  input.operation.amount = 2;
  await enqueued;
  Object.assign(outbox.store.getState().entries[0].operation, { amount: 3 });

  await outbox.flush();
  await outbox.flush();

  expect(observed).toEqual([1, 1]);
  expect(storage.value).toEqual({ state: [operation()], version: 0 });
  outbox.dispose();
});

test('dispose: pending hydration -> rejects restoration and never processes its late value', async () => {
  const read = deferred<unknown>();
  const started = deferred<void>();
  const { outbox, storage, sent } = setup();
  storage.getItem = () => { started.resolve(); return read.promise; };
  const hydration = outbox.rehydrate();
  const rejected = hydration.catch((error: unknown) => error);
  await started.promise;

  outbox.dispose();
  expect(await rejected).toMatchObject({ code: 'DISPOSED' });
  read.resolve({ state: [operation()], version: 0 });
  await read.promise;

  expect(storage.disposals).toBe(1);
  expect(sent).toEqual([]);
  expect(outbox.store.getState().disposed).toBe(true);
  expect(outbox.store.getState().entries).toEqual([]);
  await expect(outbox.enqueue(operation())).rejects.toBeInstanceOf(OutboxError);
  expect((await outbox.flush()).status).toBe('cancelled');
  outbox.dispose();
  expect(storage.disposals).toBe(1);
});

test('cancel: ACK waits behind a newer write -> cancellation prevents stale removal after that write', async () => {
  const started = deferred<void>();
  const response = deferred<OutboxResponse>();
  const writing = deferred<void>();
  const written = deferred<void>();
  const { outbox, storage } = setup({
    transport() { started.resolve(); return response.promise; },
  });
  await outbox.rehydrate();
  await outbox.enqueue(operation());
  const flushing = outbox.flush();
  await started.promise;
  storage.setItem = async (_key, value) => {
    writing.resolve();
    await written.promise;
    storage.value = value;
  };
  const enqueued = outbox.enqueue(operation('two', 2));
  await writing.promise;
  response.resolve(ack(operation()));
  await response.promise;

  outbox.cancel('stop');
  written.resolve();
  await enqueued;
  expect((await flushing).status).toBe('cancelled');
  // A new flush must wait for the obsolete queued ACK transaction to settle.
  outbox.setOnline(false);

  expect(storage.value).toEqual({ state: [operation(), operation('two', 2)], version: 0 });
  expect(outbox.store.getState().entries.map(entry => entry.id)).toEqual(['one', 'two']);
  outbox.dispose();
});

test('cancel: conflict resolver settles late -> never replaces durable work after cancellation', async () => {
  const started = deferred<void>();
  const resolution = deferred<{ action: 'discard' }>();
  const { outbox, storage } = setup({
    transport: record => ({ status: 'conflict', id: record.id, conflict: null }),
    resolve() { started.resolve(); return resolution.promise; },
  });
  await outbox.rehydrate();
  await outbox.enqueue(operation());
  const result = outbox.flush();
  await started.promise;

  outbox.cancel('stop resolution');
  expect(await result).toEqual({ status: 'cancelled', reason: 'stop resolution' });
  resolution.resolve({ action: 'discard' });
  await resolution.promise;
  await outbox.enqueue(operation('two', 2));

  expect(storage.value).toEqual({ state: [operation(), operation('two', 2)], version: 0 });
  expect(outbox.store.getState().entries.map(entry => entry.id)).toEqual(['one', 'two']);
  outbox.dispose();
});

test('flush: retry policy cancels reentrantly -> creates no backoff timer or replacement attempt', async () => {
  jest.useFakeTimers();
  let calls = 0;
  const { outbox } = setup({
    transport() { calls += 1; throw new Error('failed'); },
    retry: { maxAttempts: 3, delayMs() { outbox.cancel('policy'); return 100; } },
  });
  try {
    await outbox.rehydrate();
    await outbox.enqueue(operation());

    expect(await outbox.flush()).toEqual({ status: 'cancelled', reason: 'policy' });

    expect(calls).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    outbox.dispose();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('dispose: ACK write already started -> settles cancellation and ignores completion in disposed state', async () => {
  const started = deferred<void>();
  const release = deferred<void>();
  const completed = deferred<void>();
  const { outbox, storage } = setup();
  await outbox.rehydrate();
  await outbox.enqueue(operation());
  storage.setItem = async (_key, value) => {
    started.resolve();
    await release.promise;
    storage.value = value;
    completed.resolve();
  };
  const result = outbox.flush();
  await started.promise;

  outbox.dispose();
  expect((await result).status).toBe('cancelled');
  const terminal = outbox.store.getState();
  release.resolve();
  await completed.promise;

  expect(outbox.store.getState()).toBe(terminal);
  expect(terminal.disposed).toBe(true);
  expect(terminal.entries[0].id).toBe('one');
  // An adapter already committing cannot be rolled back by cancellation.
  expect(storage.value).toEqual({ state: [], version: 0 });
});

test('rehydrate: hydration observer throws -> rejects its promise and permits a later clean attempt', async () => {
  const { outbox, storage } = setup();
  const stop = outbox.store.subscribe(() => {
    if (outbox.store.getState().hydration === 'hydrating') throw new Error('observer failed');
  });

  await expect(outbox.rehydrate()).rejects.toBeInstanceOf(AggregateError);

  expect(storage.reads).toBe(0);
  stop();
  await outbox.rehydrate();
  expect(outbox.store.getState().hydration).toBe('ready');
  outbox.dispose();
});
