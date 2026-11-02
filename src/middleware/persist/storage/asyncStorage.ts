import type { PersistCodec } from './PersistCodec.js';
import type { PersistStorageFactory } from './PersistStorage.js';
import { serializeJsonValue } from './serializeJsonValue.js';

/** Borrowed React Native AsyncStorage-compatible string API; no native import is required.
 * @example
 * const storage = asyncStorage(() => AsyncStorage);
 */
export interface AsyncStorageLike {
  /** Reads the stored string for a key, or resolves to null when the key is absent. */
  getItem(key: string): Promise<string | null>;
  /** Stores a string under the given key, replacing any existing value. */
  setItem(key: string, value: string): Promise<void>;
  /** Removes the value associated with the given key. */
  removeItem(key: string): Promise<void>;
}

/**
 * @description Adapts an injected asynchronous string store without changing default
 * JSON envelope bytes. Each invocation of the returned factory calls getStorage.
 * The native instance is borrowed, never closed or globally cleared.
 * Missing keys return null; stored text is decoded with the codec or JSON.parse.
 * A decoded null value throws a TypeError because it is not a persistence envelope.
 * Writes use the codec or the default JSON serializer; removals delegate to the store.
 * Storage and serialization failures propagate to the caller.
 * @param {() => AsyncStorageLike} getStorage - Supplies the borrowed store when the
 * returned storage factory is invoked.
 * @param {PersistCodec} [codec] - Custom string encoding and decoding; omitted to
 * use the default JSON serialization and JSON.parse.
 * @param {(value: import("./PersistStorage.js").PersistedValue) => string} [codec.serialize] -
 * Encodes a persistence envelope for storage.
 * @param {(text: string) => unknown} [codec.deserialize] - Decodes stored text;
 * returning null causes the read to reject with a TypeError.
 * @returns {PersistStorageFactory} Factory creating a persistence adapter backed
 * by the supplied asynchronous store.
 * @example
 * ```ts
 * const storage = asyncStorage(() => AsyncStorage);
 * persist({ key: 'settings', storage, decode });
 * ```
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
