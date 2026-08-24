import type { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStore.js';
import { registerStoreCleanup } from '../lib/storeCleanup.js';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeAnyMiddleware, PipeMiddlewareMetadata } from '../utils/pipe/types.js';

type Dispatch<A> = (value: A) => void;
type StoreSetStateAction<T> = Parameters<Store<T>['setState']>[0];

function validateWait(wait: number | undefined): void {
  if (wait !== undefined && (!Number.isFinite(wait) || wait < 0)) {
    throw new RangeError('Debounce wait must be a finite non-negative number');
  }
}

type DebouncePipeMiddleware = PipeableMiddleware<
  PipeAnyMiddleware,
  PipeMiddlewareMetadata<'@ilokesto/state/debounce', readonly [], readonly [], 'reject', readonly []>
>;

const applyDebounce = <T>(initialState: T | Store<T>, wait = 300): Store<T> => {
  validateWait(wait);
  const store = getStore(initialState);

  let timeout: ReturnType<typeof setTimeout> | null = null;
  let scheduleGeneration = 0;
  let updates: Array<StoreSetStateAction<T>> = [];
  let savedNext: Dispatch<StoreSetStateAction<T>> | null = null;
  let unregisterTimeout: (() => void) | null = null;

  store.pushMiddleware((nextState: StoreSetStateAction<T>, next) => {
    updates.push(nextState);
    savedNext = next;

    if (timeout) {
      return;
    }

    const currentGeneration = ++scheduleGeneration;
    timeout = setTimeout(() => {
      let currentState = store.getState() as T;
      const pendingNext = savedNext;

      try {
        updates.forEach((update) => {
          if (typeof update === 'function') {
            currentState = (update as (prev: Readonly<T>) => T)(currentState);
          } else {
            currentState = update;
          }
        });
      } finally {
        if (scheduleGeneration === currentGeneration) {
          updates = [];
          timeout = null;
          savedNext = null;
          unregisterTimeout?.();
          unregisterTimeout = null;
        }
      }

      if (pendingNext) {
        pendingNext(currentState);
      }
    }, wait);
    unregisterTimeout = registerStoreCleanup(store, () => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = null;
      updates = [];
      savedNext = null;
      unregisterTimeout = null;
    });
  });

  return store;
};

/**
 * Create a pipe middleware that debounces state updates.
 *
 * Coalesces all updates within the wait period into a single commit.
 * Function updaters are applied sequentially against the latest state at
 * flush time; value updates overwrite previous ones. If an updater throws,
 * its error surfaces and later updates remain schedulable. When used with
 * `persist`, `persist` must be declared after `debounce` in the pipe chain.
 *
 * @param wait - Debounce delay in milliseconds. Must be a finite non-negative
 *   number; `0` is valid. Defaults to `300`.
 * @returns Pipe middleware registered with `@ilokesto/state/debounce` metadata.
 * @throws {RangeError} If `wait` is not a finite non-negative number. Throws
 *   during the factory call, before middleware or timer setup.
 *
 * @example
 * ```ts
 * import { debounce } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const store = pipe.use(debounce(200)).create({ count: 0 });
 * ```
 */
export function debounce(wait?: number): DebouncePipeMiddleware {
  validateWait(wait);
  const middleware: PipeAnyMiddleware = (initialState) => applyDebounce(initialState, wait);
  return definePipeableMiddleware(middleware, {
    adds: [],
    after: [],
    before: [],
    conflicts: [],
    duplicate: 'reject',
    id: '@ilokesto/state/debounce',
    requires: [],
  } as const);
}
