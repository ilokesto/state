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
  /**
   * @description Reads an untrusted envelope, or `null` when the key is absent.
   * Storage failures reject the promise; callers must validate restored data.
   * @param {string} key - Storage key to read.
   * @returns {Promise<unknown>} The untrusted stored value, or `null` if absent.
   * @example
   * ```ts
   * const stored = await storage.getItem('draft');
   * if (stored === null) {
   *   console.log('No saved draft');
   * }
   * ```
   */
  getItem(key: string): Promise<unknown>;
  /**
   * @description Writes a versioned state envelope. Resolves after the write is
   * committed, not just after a request succeeds; storage failures reject.
   * @param {string} key - Storage key to write.
   * @param {PersistedValue} value - Versioned state envelope to store.
   * @param {unknown} value.state - State after a successful commit; validation
   * happens when it is restored.
   * @param {number} value.version - Data migration version, independent of an
   * IndexedDB schema version.
   * @returns {Promise<void>} Resolves with `undefined` after the write is committed.
   * @example
   * ```ts
   * await storage.setItem('draft', {
   *   state: new Blob(['draft']),
   *   version: 0,
   * });
   * ```
   */
  setItem(key: string, value: PersistedValue): Promise<void>;
  /**
   * @description Deletes only the specified key. Resolves after deletion is
   * committed; storage failures reject.
   * @param {string} key - Storage key to delete.
   * @returns {Promise<void>} Resolves with `undefined` after deletion is committed.
   * @example
   * ```ts
   * await storage.removeItem('draft');
   * ```
   */
  removeItem(key: string): Promise<void>;
  /**
   * @description Optionally observes external-only invalidations for a key,
   * including deletion; never reports this adapter's own writes. Listeners
   * reread current storage rather than trusting delayed event payloads.
   * @param {string} key - Storage key whose external changes should be observed.
   * @param {() => void} listener - Callback notified to reread the current value.
   * @returns {() => void} Function that unsubscribes the listener.
   * @example
   * ```ts
   * const unsubscribe = storage.subscribe?.('draft', () => {
   *   void storage.getItem('draft').then(
   *     value => console.log('Current draft:', value),
   *     error => console.error('Could not reload draft:', error),
   *   );
   * });
   * unsubscribe?.();
   * ```
   */
  subscribe?(key: string, listener: () => void): () => void;
  /**
   * @description Releases this adapter instance's resources and cancels
   * unfinished work.
   * @example
   * ```ts
   * storage.dispose?.();
   * ```
   */
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
