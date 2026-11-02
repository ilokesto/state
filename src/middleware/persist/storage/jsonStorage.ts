import type { PersistStorageFactory } from './PersistStorage.js';
import { serializeJsonValue } from './serializeJsonValue.js';
import type { PersistCodec } from './PersistCodec.js';

/** Optional browser event source, evaluated only when synchronization subscribes.
 * @example
 * jsonStorage(() => localStorage, undefined, { events: () => window });
 */
export type JsonStorageOptions = {
  /** Supplies the browser event source when a storage synchronization subscription is created. */
  readonly events?: () => Pick<Window, 'addEventListener' | 'removeEventListener'>;
};

/**
 * @description Creates a factory for JSON Web Storage without evaluating the getter yet.
 * Each activation obtains its own adapter; the browser Storage itself is borrowed.
 * Default JSON serialization applies `toJSON` (including Date's string conversion).
 * Use an explicit codec or {@link indexedDBStorage} for structured values.
 * Reads return null for missing keys and reject stored values that decode to null.
 * Storage and codec errors propagate through the asynchronous adapter methods.
 * When an event source is supplied, subscriptions notify listeners for matching
 * storage-area events affecting their key or clearing storage. Disposing the
 * adapter removes its active subscriptions without disposing the borrowed Storage.
 * @param {() => Storage} getStorage - Evaluated when the factory is activated, never at definition.
 * @param {PersistCodec} [codec] - Whole-envelope string codec; omission uses JSON parsing and serialization.
 * @param {(value: import("./PersistStorage.js").PersistedValue) => string} [codec.serialize] - Encodes the complete persistence envelope for storage.
 * @param {(text: string) => unknown} [codec.deserialize] - Decodes stored text; a null result is rejected.
 * @param {JsonStorageOptions} [options] - Optional synchronization event configuration.
 * @param {() => Pick<Window, 'addEventListener' | 'removeEventListener'>} [options.events] - Supplies the event source separately for each subscription; omission disables subscription support.
 * @returns {PersistStorageFactory} Factory that obtains the Storage and creates an adapter on each activation.
 * @example
 * persist({
 *   key: 'preferences',
 *   storage: jsonStorage(() => window.localStorage, undefined, {
 *     events: () => window,
 *   }),
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
