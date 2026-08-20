import type { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStore.js';
import { registerStoreCleanup } from '../lib/storeCleanup.js';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeAnyMiddleware, PipeMiddlewareMetadata } from '../utils/pipe/types.js';

type Dispatch<A> = (value: A) => void;
type StoreSetStateAction<T> = Parameters<Store<T>['setState']>[0];

type DebouncePipeMiddleware = PipeableMiddleware<
  PipeAnyMiddleware,
  PipeMiddlewareMetadata<'@ilokesto/state/debounce', readonly [], readonly [], 'reject', readonly []>
>;

const applyDebounce = <T>(initialState: T | Store<T>, wait = 300): Store<T> => {
  const store = getStore(initialState);

  let timeout: ReturnType<typeof setTimeout> | null = null;
  let updates: Array<StoreSetStateAction<T>> = [];
  let savedNext: Dispatch<StoreSetStateAction<T>> | null = null;
  let unregisterTimeout: (() => void) | null = null;

  store.pushMiddleware((nextState: StoreSetStateAction<T>, next) => {
    updates.push(nextState);
    savedNext = next;

    if (timeout) {
      return;
    }

    timeout = setTimeout(() => {
      let currentState = store.getState() as T;

      updates.forEach((update) => {
        if (typeof update === 'function') {
          currentState = (update as (prev: Readonly<T>) => T)(currentState);
        } else {
          currentState = update;
        }
      });

      const pendingNext = savedNext;
      updates = [];
      timeout = null;
      savedNext = null;
      unregisterTimeout?.();
      unregisterTimeout = null;

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
 * flush time; value updates overwrite previous ones.
 *
 * @param wait - Debounce delay in milliseconds. Defaults to `300`.
 * @returns Pipe middleware registered with `@ilokesto/state/debounce` metadata.
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
