import type { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStore.js';
import { registerStoreCleanup } from '../lib/storeCleanup.js';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeAnyMiddleware, PipeMiddlewareMetadata } from '../utils/pipe/types.js';

type ThrottlePipeMiddleware = PipeableMiddleware<
  PipeAnyMiddleware,
  PipeMiddlewareMetadata<'@ilokesto/state/throttle', readonly [], readonly [], 'reject', readonly []>
>;

function validateWait(wait: number | undefined): void {
  if (wait !== undefined && (!Number.isFinite(wait) || wait < 0)) {
    throw new RangeError('Throttle wait must be a finite non-negative number');
  }
}

function applyThrottle<T>(initialState: T | Store<T>, wait = 300): Store<T> {
  validateWait(wait);
  const store = getStore(initialState);
  let gateOpen = true;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let unregisterTimeout: (() => void) | null = null;

  store.pushMiddleware((nextState, next) => {
    if (!gateOpen) {
      return;
    }

    gateOpen = false;
    timeout = setTimeout(() => {
      timeout = null;
      gateOpen = true;
      unregisterTimeout?.();
      unregisterTimeout = null;
    }, wait);
    unregisterTimeout = registerStoreCleanup(store, () => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }

      timeout = null;
      gateOpen = true;
      unregisterTimeout = null;
    });
    next(nextState);
  });

  return store;
}

/**
 * Create a pipe middleware that throttles state updates with leading-edge
 * behavior.
 *
 * The first update passes through immediately; subsequent updates are dropped
 * until the wait period elapses. Dropped updates are not retried.
 *
 * @param wait - Throttle window in milliseconds. Defaults to `300`.
 * @returns Pipe middleware registered with `@ilokesto/state/throttle` metadata.
 *
 * @example
 * ```ts
 * import { throttle } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const store = pipe.use(throttle(250)).create({ count: 0 });
 * ```
 */
export function throttle(wait?: number): ThrottlePipeMiddleware {
  validateWait(wait);
  const middleware: PipeAnyMiddleware = (initialState) => applyThrottle(initialState, wait);
  return definePipeableMiddleware(middleware, {
    adds: [],
    after: [],
    before: [],
    conflicts: [],
    duplicate: 'reject',
    id: '@ilokesto/state/throttle',
    requires: [],
  } as const);
}
