import type { StoreApi } from '@ilokesto/store';
import { dispose } from '../lib/storeCleanup.js';

/** Bounded, notification-driven waiting; no polling or timer advancement. */
export type StoreWaitOptions = {
  /** Failure deadline only. Defaults to 1000 ms. */
  readonly timeoutMs?: number;
  /** Cancels only this wait and removes its abort listener. */
  readonly signal?: AbortSignal;
};

/** An owned test subscription and explicit middleware cleanup. */
export type StoreTestHarness<State> = {
  /** Initial and notified state references; no deep copies or hidden writes. */
  readonly states: ReadonlyArray<Readonly<State>>;
  /** Checks current state immediately, then checks future notifications. */
  readonly waitFor: (
    predicate: (state: Readonly<State>) => boolean,
    options?: StoreWaitOptions,
  ) => Promise<Readonly<State>>;
  /** Unsubscribes, rejects pending waits and disposes this store's middleware. */
  readonly dispose: () => void;
};

/**
 * @description Records the initial state and subsequent store notifications,
 * retaining state references rather than deep copies. Waits check the current
 * state immediately, then check future notifications without polling or timer
 * advancement. Register waits before triggering work, await persist.flush/rehydrate
 * for I/O, and dispose the harness in finally. The harness owns middleware cleanup.
 * @param {StoreApi<State>} store - Store to observe and whose middleware is cleaned
 * up when the harness is disposed.
 * @returns {StoreTestHarness<State>} An owned subscription with state history,
 * condition-based waiting and explicit cleanup.
 * - states `ReadonlyArray<Readonly<State>>` - A fresh array containing the initial
 *   and notified state references; reading it does not mutate the store.
 * - waitFor `(predicate: (state: Readonly<State>) => boolean, options?: StoreWaitOptions) => Promise<Readonly<State>>` - Resolves with the first matching current or notified state.
 *   Rejects if the predicate throws, the deadline expires, the signal aborts or
 *   the harness is disposed. The deadline defaults to 1000 ms and must be an
 *   integer from 0 through 2147483647; invalid values reject with RangeError.
 *   Aborting rejects with the signal's reason. Each settled wait removes its
 *   timer, abort listener and notification check.
 * - dispose `() => void` - Idempotently unsubscribes, rejects pending waits and
 *   disposes the store's middleware. Subsequent waits reject.
 * @example
 * ```ts
 * const harness = createStoreTestHarness(store);
 * try {
 *   const completed = harness.waitFor(state => state.count === 1, {
 *     timeoutMs: 500,
 *   });
 *   store.set({ count: 1 });
 *   await completed;
 * } finally {
 *   harness.dispose();
 * }
 * ```
 */
export function createStoreTestHarness<State>(store: StoreApi<State>): StoreTestHarness<State> {
  const states: Array<Readonly<State>> = [store.getState()];
  const waiters = new Set<(state: Readonly<State>) => void>();
  const cancellations = new Set<() => void>();
  let isDisposed = false;
  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    states.push(state);
    for (const check of [...waiters]) {
      check(state);
    }
  });

  return {
    get states() {
      return states.slice();
    },
    waitFor(predicate, { timeoutMs = 1000, signal } = {}) {
      if (isDisposed) {
        return Promise.reject(new Error('Store test harness is disposed'));
      }
      if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2_147_483_647) {
        return Promise.reject(new RangeError('timeoutMs must be an integer between 0 and 2147483647'));
      }
      if (signal?.aborted) {
        return Promise.reject(signal.reason);
      }

      return new Promise((resolve, reject) => {
        let isSettled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (complete: () => void) => {
          if (isSettled) {
            return;
          }
          isSettled = true;
          clearTimeout(timer);
          waiters.delete(check);
          cancellations.delete(cancel);
          signal?.removeEventListener('abort', abort);
          complete();
        };
        const check = (state: Readonly<State>) => {
          if (isSettled) {
            return;
          }
          try {
            if (predicate(state)) {
              finish(() => resolve(state));
            }
          } catch (error) {
            finish(() => reject(error));
          }
        };
        const cancel = () => finish(() => reject(new Error('Store test harness is disposed')));
        const abort = () => finish(() => reject(signal?.reason));
        waiters.add(check);
        cancellations.add(cancel);
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(
          () => finish(() => reject(new Error('Store state condition timed out'))),
          timeoutMs,
        );
        check(store.getState());
      });
    },
    dispose() {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      unsubscribe();
      for (const cancel of [...cancellations]) {
        cancel();
      }
      dispose(store);
    },
  };
}
