import type { PersistedValue } from './PersistStorage.js';

/**
 * @description Serializes persisted state and its version to JSON, rejecting values
 * JSON would silently discard or replace with an empty object. Throws TypeError
 * for undefined, functions, symbols, bigints, non-finite numbers, and non-array
 * objects whose prototype is neither Object.prototype nor null, as encountered
 * by the JSON replacer. JSON.stringify applies toJSON methods before validation
 * and also throws for circular references.
 * @param {PersistedValue} value - Persisted state and version to serialize.
 * @param {unknown} value.state - State to encode; values encountered during
 * serialization must satisfy the JSON compatibility checks.
 * @param {number} value.version - Persisted schema version; must be finite.
 * @returns {string} JSON representation of the persisted state and version.
 * @example
 * ```ts
 * const json = serializeJsonValue({
 *   state: { theme: 'dark', favorites: ['dashboard'] },
 *   version: 1,
 * });
 * // '{"state":{"theme":"dark","favorites":["dashboard"]},"version":1}'
 * ```
 */
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
