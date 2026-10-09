/**
 * Versioned state passed to storage without prescribing a serialization format.
 * @example
 * const value: PersistedValue = { state: new Map([['count', 1]]), version: 0 };
 */
export type PersistedValue = {
  /** State after a successful commit; validation happens when it is restored. */
  readonly state: unknown;
  /** Data migration version, independent of an IndexedDB schema version. */
  readonly version: number;
};

/**
 * One store's asynchronous storage adapter.
 * Missing entries return `null`; failures reject instead of appearing successful.
 * @example
 * const storage = indexedDBStorage({ database: 'editor' })();
 * await storage.setItem('draft', { state: new Blob(['draft']), version: 0 });
 * storage.dispose?.();
 */
export interface PersistStorage {
  /** Reads an untrusted envelope, or `null` when the key is absent. */
  getItem(key: string): Promise<unknown>;
  /** Resolves after the write is committed, not just after a request succeeds. */
  setItem(key: string, value: PersistedValue): Promise<void>;
  /** Deletes only this key and resolves after deletion is committed. */
  removeItem(key: string): Promise<void>;
  /** Releases this instance's resources and cancels unfinished work. */
  dispose?(): void;
}

/**
 * Creates an independent adapter when persistence is activated.
 * Optional internal metadata is not required for custom factories.
 * @example
 * const factory: PersistStorageFactory = indexedDBStorage({ database: 'editor' });
 * // Reusing the factory does not share adapter ownership between stores.
 */
export type PersistStorageFactory = () => PersistStorage;
