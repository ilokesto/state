import type { PersistStorageFactory } from './PersistStorage.js';
import { serializeJsonValue } from './serializeJsonValue.js';
import type { PersistCodec } from './PersistCodec.js';

/**
 * Creates a factory for JSON Web Storage without evaluating the getter yet.
 * Each activation obtains its own adapter; the browser Storage itself is borrowed.
 * Default JSON serialization applies `toJSON` (including Date's string conversion).
 * Use an explicit codec or {@link indexedDBStorage} for structured values.
 * @param getStorage - Evaluated when the factory is activated, never at definition.
 * @param codec - Optional whole-envelope string codec; omitted preserves JSON storage.
 * @example
 * persist({
 *   key: 'preferences',
 *   storage: jsonStorage(() => window.localStorage),
 *   decode: decodePreferences,
 * });
 */
export function jsonStorage(getStorage: () => Storage, codec?: PersistCodec): PersistStorageFactory {
  return () => {
    const storage = getStorage();
    return {
      async getItem(key) {
        const value = storage.getItem(key);
        if (value === null) {
          return null;
        }
        const parsed: unknown = codec ? codec.deserialize(value) : JSON.parse(value);
        if (parsed === null) {
          throw new TypeError('Stored JSON must contain a persistence envelope');
        }
        return parsed;
      },
      async setItem(key, value) {
        storage.setItem(key, codec ? codec.serialize(value) : serializeJsonValue(value));
      },
      async removeItem(key) {
        storage.removeItem(key);
      },
    };
  };
}
