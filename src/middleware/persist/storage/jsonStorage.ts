import type { PersistStorageFactory } from './PersistStorage.js';
import { serializeJsonValue } from './serializeJsonValue.js';

/**
 * Creates a factory for JSON Web Storage without evaluating the getter yet.
 * Each activation obtains its own adapter; the browser Storage itself is borrowed.
 * JSON serialization applies `toJSON` (including Date's string conversion).
 * Unsupported structured values must use {@link indexedDBStorage} instead.
 * @param getStorage - Evaluated when the factory is activated, never at definition.
 * @example
 * persist({
 *   key: 'preferences',
 *   storage: jsonStorage(() => window.localStorage),
 *   decode: decodePreferences,
 * });
 */
export function jsonStorage(getStorage: () => Storage): PersistStorageFactory {
  return () => {
    const storage = getStorage();
    return {
      async getItem(key) {
        const value = storage.getItem(key);
        if (value === null) {
          return null;
        }
        const parsed: unknown = JSON.parse(value);
        if (parsed === null) {
          throw new TypeError('Stored JSON must contain a persistence envelope');
        }
        return parsed;
      },
      async setItem(key, value) {
        storage.setItem(key, serializeJsonValue(value));
      },
      async removeItem(key) {
        storage.removeItem(key);
      },
    };
  };
}
