import { createStore } from '@ilokesto/store';
import type { ReadableStore } from '@ilokesto/store';
import { createPersistRuntime } from '../middleware/persist/createPersistRuntime.js';
import type { PersistStorageFactory } from '../middleware/persist/storage/PersistStorage.js';
import { createResource } from './createResource.js';
import type { ResourceResult } from './createResource.js';
import { dispose } from './storeCleanup.js';

/** An application-assigned, globally unique idempotency key and its immutable operation. */
export type OutboxRecord<Operation> = {
  readonly id: string;
  readonly operation: Operation;
};

/** The transport must validate its backend response before returning this protocol. */
export type OutboxResponse<Conflict = unknown> =
  | { readonly status: 'ack'; readonly id: string }
  | { readonly status: 'conflict'; readonly id: string; readonly conflict: Conflict };

export type OutboxContext = {
  readonly signal: AbortSignal;
  /** Fixed for this instance, including after an account change elsewhere. */
  readonly key: string;
};

/** No implicit last-write-wins: replacement is a new operation with a fresh ID. */
export type OutboxResolution<Operation> =
  | { readonly action: 'keep' }
  | { readonly action: 'discard' }
  | { readonly action: 'replace'; readonly record: OutboxRecord<Operation> };

export type OutboxOptions<Operation, Conflict = unknown> = {
  /** Required, outbox-only storage key; use a separate key for each account. */
  readonly key: string;
  readonly storage: PersistStorageFactory;
  /** Validate a structured-cloneable operation at enqueue and restoration. */
  readonly decode: (value: unknown) => Operation | null;
  readonly transport: (
    record: OutboxRecord<Operation>, context: OutboxContext,
  ) => OutboxResponse<Conflict> | PromiseLike<OutboxResponse<Conflict>>;
  readonly resolve?: (
    record: OutboxRecord<Operation>, conflict: Conflict, context: OutboxContext,
  ) => OutboxResolution<Operation> | PromiseLike<OutboxResolution<Operation>>;
  /** Defaults to true. No browser events or network listeners are installed. */
  readonly online?: boolean;
  /** Only transport throws/rejections retry; omitted means one attempt per flush. */
  readonly retry?: {
    readonly maxAttempts: number;
    /** Failed attempt is one-based. Defaults to zero; never an unbounded policy. */
    readonly delayMs?: number | ((attempt: number, error: unknown) => number);
  };
};

export type OutboxEntry<Operation> = OutboxRecord<Operation> & {
  readonly status: 'pending' | 'inflight' | 'error';
  /** Attempts in this instance, reset on restart. */
  readonly attempts: number;
  readonly error: unknown | null;
};

export type OutboxState<Operation> = {
  readonly hydration: 'idle' | 'hydrating' | 'ready' | 'error';
  readonly online: boolean;
  readonly disposed: boolean;
  readonly entries: ReadonlyArray<OutboxEntry<Operation>>;
  readonly error: unknown | null;
};

export type Outbox<Operation> = {
  readonly store: ReadableStore<OutboxState<Operation>>;
  readonly rehydrate: () => Promise<void>;
  /** Resolves only after the validated record has been durably saved. Does not send. */
  readonly enqueue: (record: OutboxRecord<Operation>) => Promise<void>;
  /** Sends a finite snapshot after earlier enqueues settle. Concurrent calls share a run. */
  readonly flush: () => Promise<ResourceResult<void>>;
  /** Stops delivery/backoff, retaining unacknowledged operations for a later flush. */
  readonly cancel: (reason?: unknown) => void;
  /** Going offline cancels delivery; going online requires an explicit flush. */
  readonly setOnline: (online: boolean) => void;
  /** Terminal, scoped cleanup. Does not delete durable operations. */
  readonly dispose: () => void;
};

/** Protocol/lifecycle failure; storage failures retain their original PersistError. */
export class OutboxError extends Error {
  constructor(
    readonly code: 'INVALID_RECORD' | 'DUPLICATE_ID' | 'NOT_READY' | 'DISPOSED' |
      'OFFLINE' | 'INVALID_RESPONSE' | 'CONFLICT',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'OutboxError';
  }
}

function validateDelay(delay: number): number {
  if (!Number.isFinite(delay) || delay < 0 || delay > 2_147_483_647) {
    throw new RangeError('Outbox retry delay must be between 0 and 2147483647');
  }
  return delay;
}

/**
 * Own a durable, opt-in, at-least-once outbox. Server-side idempotency is required.
 * One active owner per storage key is required; no cross-tab locking is installed.
 * @example
 * const outbox = createOutbox({ key: 'account:42:outbox', storage, decode, transport });
 * await outbox.rehydrate();
 * await outbox.enqueue({ id: crypto.randomUUID(), operation });
 * const result = await outbox.flush();
 */
export function createOutbox<Operation, Conflict = unknown>(
  options: OutboxOptions<Operation, Conflict>,
): Outbox<Operation> {
  const { key, storage, decode, transport, resolve } = options;
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new TypeError('Outbox requires an explicit non-empty storage key');
  }
  const maxAttempts = options.retry?.maxAttempts ?? 1;
  const delayMs = options.retry?.delayMs ?? 0;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('Outbox maxAttempts must be a positive safe integer');
  }
  if (typeof delayMs === 'number') validateDelay(delayMs);

  type Records = ReadonlyArray<OutboxRecord<Operation>>;
  let records: Records = [];
  let hydration: OutboxState<Operation>['hydration'] = 'idle';
  let online = options.online ?? true;
  let disposed = false;
  let error: unknown | null = null;
  let inflight: string | undefined;
  let restoring: Promise<void> | undefined;
  let mutations = Promise.resolve();
  const usedIds = new Set<string>();
  const attempts = new Map<string, number>();
  const failures = new Map<string, unknown>();
  type Batch = { readonly controller: AbortController; readonly promise: Promise<ResourceResult<void>> };
  let active: Batch | undefined;

  const parseRecord = (value: unknown): OutboxRecord<Operation> => {
    if (
      typeof value !== 'object' || value === null ||
      !('id' in value) || typeof value.id !== 'string' || value.id.trim().length === 0 ||
      !('operation' in value)
    ) {
      throw new OutboxError('INVALID_RECORD', 'Outbox records require an ID and operation');
    }
    const operation = decode(structuredClone(value.operation));
    if (operation === null) {
      throw new OutboxError('INVALID_RECORD', 'Outbox operation failed decoding');
    }
    // Neither the caller nor a decoder retaining its input can change an accepted operation.
    return { id: value.id, operation: structuredClone(operation) };
  };
  const persisted = createStore<Records>([]);
  const persistence = createPersistRuntime(persisted, {
    key, storage,
    decode(value: unknown): Records | null {
      if (!Array.isArray(value)) return null;
      const decoded = Array.from(value, parseRecord);
      if (new Set(decoded.map(record => record.id)).size !== decoded.length) return null;
      return decoded;
    },
    project: (value: Records) => value,
    restore: (value: Records) => value,
  });
  // An ACK is not published as removed until its explicit storage flush succeeds.
  persistence.pause();
  const state = createStore<OutboxState<Operation>>({
    hydration, online, disposed, entries: [], error,
  });
  const publish = (): void => {
    state.set({
      hydration, online, disposed, error,
      entries: records.map(record => ({
        ...structuredClone(record),
        status: inflight === record.id ? 'inflight' : failures.has(record.id) ? 'error' : 'pending',
        attempts: attempts.get(record.id) ?? 0,
        error: failures.get(record.id) ?? null,
      })),
    });
  };
  const assertReady = (): void => {
    if (disposed) throw new OutboxError('DISPOSED', 'Outbox has been disposed');
    if (hydration !== 'ready') throw new OutboxError('NOT_READY', 'Rehydrate the outbox first');
  };
  const assertSending = (signal: AbortSignal): void => {
    signal.throwIfAborted();
    assertReady();
    if (!online) throw new OutboxError('OFFLINE', 'Outbox is offline');
  };

  // Serialize read-modify-write transactions, not network calls. ACKs always
  // remove from the newest queue, so concurrent enqueues cannot be overwritten.
  const mutate = (update: (current: Records) => Records): Promise<void> => {
    const result = mutations.then(async () => {
      assertReady();
      const next = update(records);
      if (next === records) return;
      persisted.set(structuredClone(next));
      await persistence.flush();
      assertReady();
      records = next;
      for (const record of records) usedIds.add(record.id);
      error = null;
      publish();
    }).catch((cause: unknown) => {
      if (!disposed) {
        error = cause;
        publish();
      }
      throw cause;
    });
    mutations = result.then(() => undefined, () => undefined);
    return result;
  };

  const backoff = (delay: number, signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted();
    return new Promise((complete, reject) => {
      const onAbort = (): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        complete();
      }, delay);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  };

  const worker = createResource(async (target: Promise<Records>, { signal }) => {
    for (const record of await target) {
      assertSending(signal);
      // A previous ACK may finish saving after its delivery run was cancelled.
      await mutations;
      assertSending(signal);
      if (!records.some(current => current.id === record.id)) continue;
      try {
        let response: OutboxResponse<Conflict> | undefined;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          assertSending(signal);
          inflight = record.id;
          attempts.set(record.id, (attempts.get(record.id) ?? 0) + 1);
          failures.delete(record.id);
          error = null;
          publish();
          assertSending(signal);
          try {
            response = await transport(structuredClone(record), { signal, key });
          } catch (cause) {
            assertSending(signal);
            if (attempt === maxAttempts) throw cause;
            const delay = validateDelay(typeof delayMs === 'function' ? delayMs(attempt, cause) : delayMs);
            // The policy callback is user code and can cancel or dispose.
            assertSending(signal);
            inflight = undefined;
            failures.set(record.id, cause);
            error = cause;
            publish();
            assertSending(signal);
            await backoff(delay, signal);
            continue;
          }
          break;
        }
        assertSending(signal);
        if (
          typeof response !== 'object' || response === null || response.id !== record.id ||
          (response.status !== 'ack' && response.status !== 'conflict') ||
          (response.status === 'conflict' && !('conflict' in response))
        ) {
          throw new OutboxError('INVALID_RESPONSE', 'Transport must acknowledge the exact operation ID');
        }
        let replacement: OutboxRecord<Operation> | undefined;
        if (response.status === 'conflict') {
          const resolution = resolve
            ? await resolve(structuredClone(record), response.conflict, { signal, key })
            : { action: 'keep' as const };
          assertSending(signal);
          if (resolution?.action === 'keep') {
            throw new OutboxError('CONFLICT', 'Outbox conflict requires explicit resolution', {
              cause: response.conflict,
            });
          }
          if (resolution?.action === 'replace') {
            replacement = parseRecord(resolution.record);
          } else if (resolution?.action !== 'discard') {
            throw new OutboxError('INVALID_RESPONSE', 'Invalid outbox conflict resolution');
          }
        }
        await mutate(current => {
          assertSending(signal);
          if (replacement && usedIds.has(replacement.id)) {
            throw new OutboxError('DUPLICATE_ID', 'A replacement requires a fresh operation ID');
          }
          return current.flatMap(item => item.id !== record.id ? [item] : replacement ? [replacement] : []);
        });
        assertSending(signal);
        inflight = undefined;
        failures.delete(record.id);
        attempts.delete(record.id);
        publish();
      } catch (cause) {
        if (!signal.aborted && !disposed) {
          inflight = undefined;
          failures.set(record.id, cause);
          error = cause;
          publish();
        }
        throw cause;
      }
    }
  });

  const cancel = (reason: unknown = new DOMException('Outbox cancelled', 'AbortError')): void => {
    const previous = active;
    active = undefined;
    inflight = undefined;
    previous?.controller.abort(reason);
    // Abort listeners may have started a newer flush; publish its current state.
    if (!disposed) publish();
  };

  return {
    store: {
      getState: () => state.getState(),
      getInitialState: () => state.getInitialState(),
      subscribe: listener => state.subscribe(listener),
      subscribeSelector: (selector, listener, equalityFn) =>
        state.subscribeSelector(selector, listener, equalityFn),
    },
    rehydrate() {
      if (disposed) return Promise.reject(new OutboxError('DISPOSED', 'Outbox has been disposed'));
      if (restoring) return restoring;
      if (hydration === 'ready') return Promise.resolve();
      hydration = 'hydrating';
      error = null;
      restoring = Promise.resolve().then(async () => {
        if (disposed) throw new OutboxError('DISPOSED', 'Outbox has been disposed');
        publish();
        await persistence.rehydrate();
        if (disposed) throw new OutboxError('DISPOSED', 'Outbox has been disposed');
        records = structuredClone(persisted.getState());
        for (const record of records) usedIds.add(record.id);
        hydration = 'ready';
        error = null;
        publish();
      }).catch((cause: unknown) => {
        if (!disposed) {
          hydration = 'error';
          error = cause;
          publish();
        }
        throw cause;
      }).finally(() => { restoring = undefined; });
      return restoring;
    },
    async enqueue(input) {
      assertReady();
      const record = parseRecord(input);
      await mutate(current => {
        if (usedIds.has(record.id)) {
          throw new OutboxError('DUPLICATE_ID', 'Operation IDs must not be reused');
        }
        return [...current, record];
      });
    },
    flush() {
      if (disposed || !online) {
        return Promise.resolve({
          status: 'cancelled',
          reason: new OutboxError(disposed ? 'DISPOSED' : 'OFFLINE', 'Outbox delivery is disabled'),
        });
      }
      if (active) return active.promise;
      if (hydration !== 'ready') {
        return Promise.resolve({
          status: 'error', error: new OutboxError('NOT_READY', 'Rehydrate the outbox first'),
        });
      }
      const controller = new AbortController();
      const target = mutations.then(() => records.slice());
      const batch: Batch = {
        controller,
        // Publish ownership before invoking user transport/subscribers.
        promise: Promise.resolve().then(() => worker.run(target, { signal: controller.signal }))
          .then(result => {
            if (active === batch) {
              active = undefined;
              inflight = undefined;
              if (result.status === 'error') error = result.error;
              try {
                publish();
              } catch (cause) {
                return { status: 'error' as const, error: cause };
              }
            }
            return result;
          }),
      };
      active = batch;
      return batch.promise;
    },
    cancel,
    setOnline(value) {
      if (disposed) throw new OutboxError('DISPOSED', 'Outbox has been disposed');
      online = value;
      if (!online) cancel(new OutboxError('OFFLINE', 'Outbox is offline'));
      else publish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        cancel(new OutboxError('DISPOSED', 'Outbox has been disposed'));
        worker.dispose();
      } finally {
        try {
          dispose(persisted);
        } finally {
          publish();
        }
      }
    },
  };
}
