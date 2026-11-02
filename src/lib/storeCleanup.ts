import type { StoreApi } from '@ilokesto/store';

type Cleanup = () => void;

type CleanupEntry = {
  /** Whether this registration is still eligible to run during disposal. */
  active: boolean;
  /** Callback to release resources when the associated store is disposed. */
  readonly cleanup: Cleanup;
};

const cleanupsByStore = new WeakMap<object, Set<CleanupEntry>>();

/**
 * @description Registers a cleanup callback for a store. Each registration is
 * independent, even when the same callback is registered more than once.
 * The callback runs when the store is disposed unless its registration has
 * already been removed.
 * @param {StoreApi<T>} store - Store whose disposal should run the callback.
 * @param {Cleanup} cleanup - Callback that releases resources owned by the store.
 * @returns {() => void} Idempotent function that removes this registration
 * without running its cleanup callback.
 * @example
 * ```ts
 * function trackTimer(store: StoreApi<number>, timer: ReturnType<typeof setTimeout>) {
 *   const unregister = registerStoreCleanup(store, () => clearTimeout(timer));
 *
 *   return () => {
 *     clearTimeout(timer);
 *     unregister();
 *   };
 * }
 * ```
 */
export function registerStoreCleanup<T>(store: StoreApi<T>, cleanup: Cleanup): () => void {
  const entry: CleanupEntry = { active: true, cleanup };
  const entries = cleanupsByStore.get(store) ?? new Set<CleanupEntry>();
  entries.add(entry);
  cleanupsByStore.set(store, entries);

  return () => {
    if (!entry.active) {
      return;
    }

    entry.active = false;
    entries.delete(entry);
  };
}

/**
 * @description Disposes a store by running its active registered cleanup functions.
 *
 * Cancels pending timers (debounce, throttle) and releases middleware-owned
 * resources through those callbacks. Disposal is scoped to the given store
 * and is safe to call multiple times.
 *
 * Removes the current registrations before invoking callbacks and marks each
 * registration inactive before running it. All eligible callbacks in the
 * snapshot are attempted even if some throw. Registrations added during cleanup
 * remain available for a subsequent disposal.
 *
 * @param {StoreApi<T>} store - The store whose registered resources to release;
 * this does not otherwise destroy the store or change its state.
 * @throws {AggregateError} When one or more cleanup functions throw, containing
 * all thrown values after the remaining eligible callbacks have been attempted.
 * @example
 * ```ts
 * function releaseAfterUse(store: StoreApi<number>) {
 *   const timer = setTimeout(() => console.log(store.getState()), 1000);
 *   registerStoreCleanup(store, () => clearTimeout(timer));
 *
 *   dispose(store); // Cancels the timer.
 *   dispose(store); // No callbacks remain to run.
 * }
 * ```
 */
export function dispose<T>(store: StoreApi<T>): void {
  const entries = cleanupsByStore.get(store);
  if (!entries) {
    return;
  }

  const snapshot = [...entries];
  cleanupsByStore.delete(store);
  const errors: unknown[] = [];

  for (const entry of snapshot) {
    if (!entry.active) {
      continue;
    }

    entry.active = false;

    try {
      entry.cleanup();
    } catch (error) {
      if (error instanceof Error) {
        errors.push(error);
        continue;
      }

      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Store cleanup failed');
  }
}
