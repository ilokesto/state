import { asyncStorage } from './asyncStorage.js';
import type { PersistCodec } from './PersistCodec.js';
import type { PersistStorageFactory } from './PersistStorage.js';

/**
 * Borrowed MMKV-compatible string operations.
 * @example
 * const storage = mmkvStorage(() => mmkv);
 */
export interface MMKVStorageLike {
  /** Reads a stored string, returning undefined when the key is absent. */
  getString(key: string): string | undefined;
  /** Writes a string under the supplied key. */
  set(key: string, value: string): void;
  /** Removes a key; any boolean result is ignored by the adapter. */
  remove(key: string): boolean | void;
}

/**
 * @description Adapts injected synchronous MMKV operations to explicit asynchronous
 * persistence. Each factory invocation obtains storage through getStorage.
 * Reads convert missing values to null; writes and removals discard the underlying
 * operation's result. The optional codec is forwarded to asyncStorage.
 * @param {() => MMKVStorageLike} getStorage - Supplies the MMKV-compatible storage
 * instance used by each created adapter.
 * @param {PersistCodec} [codec] - Custom serialization and deserialization passed
 * to asyncStorage.
 * @param {(value: import("./PersistStorage.js").PersistedValue) => string} [codec.serialize] - Converts
 * a persisted value to the string written to MMKV.
 * @param {(text: string) => unknown} [codec.deserialize] - Parses a stored string
 * into a value for the persistence layer.
 * @returns {PersistStorageFactory} Factory for asynchronous persistence backed by
 * the supplied synchronous MMKV operations.
 * @example
 * ```ts
 * persist({ key: 'settings', storage: mmkvStorage(() => mmkv), decode });
 * ```
 */
export function mmkvStorage(
  getStorage: () => MMKVStorageLike,
  codec?: PersistCodec,
): PersistStorageFactory {
  return asyncStorage(() => {
    const storage = getStorage();
    return {
      async getItem(key) { return storage.getString(key) ?? null; },
      async setItem(key, value) { storage.set(key, value); },
      async removeItem(key) { storage.remove(key); },
    };
  }, codec);
}
