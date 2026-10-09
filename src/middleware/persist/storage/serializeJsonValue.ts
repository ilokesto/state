import type { PersistedValue } from './PersistStorage.js';

/** Reject values JSON would silently discard or replace with an empty object. */
export function serializeJsonValue(value: PersistedValue): string {
  return JSON.stringify(value, (_key, candidate: unknown) => {
    if (
      candidate === undefined ||
      typeof candidate === 'function' ||
      typeof candidate === 'symbol' ||
      typeof candidate === 'bigint' ||
      (typeof candidate === 'number' && !Number.isFinite(candidate))
    ) {
      throw new TypeError('JSON storage requires JSON-compatible values');
    }
    if (typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)) {
      const prototype: unknown = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('Use IndexedDB storage for structured values');
      }
    }
    return candidate;
  });
}
