import type { PersistStorageFactory } from './PersistStorage.js';

/** Explicit lifetime policy, in milliseconds.
 * @example
 * ttlStorage(storage, { ttlMs: 60_000 });
 */
export type TTLStorageOptions = {
  /** Positive, finite lifetime in milliseconds, measured from each write. */
  readonly ttlMs: number;
  /** Clock returning a finite timestamp in milliseconds; defaults to Date.now. */
  readonly now?: () => number;
};

/**
 * @description Wraps storage with an explicit, tagged TTL format; unwrapped legacy
 * entries reject. Each write stores the original state and version with an
 * expiration calculated from the clock and TTL. Reads restore the original
 * envelope, or return null when absent or at or past expiration. Expired reads
 * do not delete a possibly newer concurrent write. Subscription and disposal
 * support are forwarded to the underlying adapter.
 * @param {PersistStorageFactory} storage - Factory creating the underlying storage adapter.
 * @param {TTLStorageOptions} options - Expiration duration and optional clock.
 * @param {number} options.ttlMs - Positive, finite lifetime in milliseconds from each write.
 * @param {() => number} [options.now] - Clock returning finite millisecond timestamps;
 * defaults to Date.now. Use a consistent epoch for writes and reads.
 * @returns {PersistStorageFactory} Factory creating a TTL-wrapped adapter.
 * @throws {RangeError} If the TTL is not positive and finite, a clock reading is
 * nonfinite, or a calculated expiration is nonfinite.
 * @throws {TypeError} If a stored entry has an invalid envelope or lacks valid,
 * explicitly tagged TTL metadata.
 * @example
 * ```ts
 * const storage = ttlStorage(jsonStorage(() => localStorage), { ttlMs: 60_000 });
 * const adapter = storage();
 * await adapter.setItem('session', { state: { signedIn: true }, version: 1 });
 * const session = await adapter.getItem('session');
 * // Within the TTL: { state: { signedIn: true }, version: 1 }.
 * // At or after expiration: null.
 * ```
 */
export function ttlStorage(
  storage: PersistStorageFactory,
  options: TTLStorageOptions,
): PersistStorageFactory {
  if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
    throw new RangeError('ttlMs must be a positive finite duration');
  }
  const now = (): number => {
    const time = (options.now ?? Date.now)();
    if (!Number.isFinite(time)) throw new RangeError('TTL clock must return a finite timestamp');
    return time;
  };
  return () => {
    const adapter = storage();
    const subscribe = adapter.subscribe?.bind(adapter);
    return {
      async getItem(key) {
        const envelope = await adapter.getItem(key);
        if (envelope === null) return null;
        if (
          typeof envelope !== 'object' || Array.isArray(envelope) ||
          !Object.hasOwn(envelope, 'state') || !('state' in envelope) ||
          !Object.hasOwn(envelope, 'version') || !('version' in envelope) ||
          typeof envelope.version !== 'number' || !Number.isSafeInteger(envelope.version) ||
          envelope.version < 0
        ) throw new TypeError('Invalid TTL envelope');
        const metadata = envelope.state;
        if (
          typeof metadata !== 'object' || metadata === null || Array.isArray(metadata) ||
          !('__persistTTL' in metadata) || metadata.__persistTTL !== 1 ||
          !('expiresAt' in metadata) || typeof metadata.expiresAt !== 'number' ||
          !Number.isFinite(metadata.expiresAt) ||
          !Object.hasOwn(metadata, 'value') || !('value' in metadata)
        ) throw new TypeError('Expected an explicitly TTL-wrapped entry');
        if (now() >= metadata.expiresAt) return null;
        return { state: metadata.value, version: envelope.version };
      },
      async setItem(key, value) {
        const expiresAt = now() + options.ttlMs;
        if (!Number.isFinite(expiresAt)) throw new RangeError('TTL expiration must be finite');
        await adapter.setItem(key, {
          state: { __persistTTL: 1, expiresAt, value: value.state },
          version: value.version,
        });
      },
      async removeItem(key) { await adapter.removeItem(key); },
      ...(subscribe ? {
        subscribe,
      } : {}),
      dispose: () => { adapter.dispose?.(); },
    };
  };
}
