import type { Store } from '@ilokesto/store';

type Cleanup = () => void;

type CleanupEntry = {
  active: boolean;
  readonly cleanup: Cleanup;
};

const cleanupsByStore = new WeakMap<object, Set<CleanupEntry>>();

export function registerStoreCleanup<T>(store: Store<T>, cleanup: Cleanup): () => void {
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
 * Dispose a store by running all registered cleanup functions.
 *
 * Cancels pending timers (debounce, throttle) and releases middleware-owned
 * resources. Disposal is scoped to the given store and is safe to call
 * multiple times.
 *
 * @param store - The store to dispose.
 * @throws {AggregateError} When one or more cleanup functions throw.
 */
export function dispose<T>(store: Store<T>): void {
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
