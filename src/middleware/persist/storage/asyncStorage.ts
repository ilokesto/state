import type { PersistCodec } from './PersistCodec.js';
import type { PersistStorageFactory } from './PersistStorage.js';
import { serializeJsonValue } from './serializeJsonValue.js';

/** Borrowed React Native AsyncStorage-compatible string API; no native import is required.
 * @example
 * const storage = asyncStorage(() => AsyncStorage);
 */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Adapts an injected asynchronous string store without changing JSON envelope bytes.
 * The native instance is borrowed, never closed or globally cleared.
 * @example
 * persist({ key: 'settings', storage: asyncStorage(() => AsyncStorage), decode });
 */
export function asyncStorage(
  getStorage: () => AsyncStorageLike,
  codec?: PersistCodec,
): PersistStorageFactory {
  return () => {
    const storage = getStorage();
    return {
      async getItem(key) {
        const text = await storage.getItem(key);
        if (text === null) return null;
        const value: unknown = codec ? codec.deserialize(text) : JSON.parse(text);
        if (value === null) throw new TypeError('Stored value must contain a persistence envelope');
        return value;
      },
      async setItem(key, value) {
        await storage.setItem(key, codec ? codec.serialize(value) : serializeJsonValue(value));
      },
      async removeItem(key) {
        await storage.removeItem(key);
      },
    };
  };
}
