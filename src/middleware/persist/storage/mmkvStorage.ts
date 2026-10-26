import { asyncStorage } from './asyncStorage.js';
import type { PersistCodec } from './PersistCodec.js';
import type { PersistStorageFactory } from './PersistStorage.js';

/** Borrowed MMKV-compatible string operations.
 * @example
 * const storage = mmkvStorage(() => mmkv);
 */
export interface MMKVStorageLike {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean | void;
}

/** Adapts injected synchronous MMKV operations to explicit asynchronous persistence.
 * @example
 * persist({ key: 'settings', storage: mmkvStorage(() => mmkv), decode });
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
