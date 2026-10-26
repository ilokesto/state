import type { PersistStorageFactory } from './PersistStorage.js';
import { serializeJsonValue } from './serializeJsonValue.js';
import type { PersistCodec } from './PersistCodec.js';

/** Optional browser event source, evaluated only when synchronization subscribes.
 * @example
 * jsonStorage(() => localStorage, undefined, { events: () => window });
 */
export type JsonStorageOptions = {
  readonly events?: () => Pick<Window, 'addEventListener' | 'removeEventListener'>;
};

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
export function jsonStorage(
  getStorage: () => Storage,
  codec?: PersistCodec,
  options?: JsonStorageOptions,
): PersistStorageFactory {
  return () => {
    const storage = getStorage();
    const getEvents = options?.events;
    const subscriptions = new Set<() => void>();
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
      ...(getEvents ? {
        subscribe(key: string, listener: () => void) {
          const events = getEvents();
          const onStorage = (event: StorageEvent): void => {
            if (event.storageArea === storage && (event.key === key || event.key === null)) listener();
          };
          events.addEventListener('storage', onStorage);
          const unsubscribe = (): void => {
            events.removeEventListener('storage', onStorage);
            subscriptions.delete(unsubscribe);
          };
          subscriptions.add(unsubscribe);
          return unsubscribe;
        },
        dispose() {
          for (const unsubscribe of subscriptions) unsubscribe();
        },
      } : {}),
    };
  };
}
