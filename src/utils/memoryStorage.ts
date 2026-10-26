import type {
  PersistedValue,
  PersistStorageFactory,
} from '../middleware/persist/storage/PersistStorage.js';

/**
 * In-memory persistence with structured-clone isolation.
 * Reuse a factory to share entries, not adapter ownership; create a new factory
 * for each test. Disposing an adapter closes it without deleting shared entries.
 * @example
 * const storage = memoryStorage();
 * const store = pipe.use(persist({ key: 'count', storage, decode })).create(0);
 * await store.persist.rehydrate();
 */
export function memoryStorage(
  initialEntries: Iterable<readonly [string, PersistedValue]> = [],
): PersistStorageFactory {
  const entries = new Map<string, PersistedValue>();
  for (const [key, value] of initialEntries) {
    entries.set(key, structuredClone(value));
  }

  return () => {
    let isDisposed = false;
    const assertActive = () => {
      if (isDisposed) {
        throw new Error('Memory storage adapter is disposed');
      }
    };

    return {
      async getItem(key) {
        assertActive();
        const value = entries.get(key);
        return value === undefined ? null : structuredClone(value);
      },
      async setItem(key, value) {
        assertActive();
        entries.set(key, structuredClone(value));
      },
      async removeItem(key) {
        assertActive();
        entries.delete(key);
      },
      dispose() {
        isDisposed = true;
      },
    };
  };
}
