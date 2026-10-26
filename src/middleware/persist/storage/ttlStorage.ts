import type { PersistStorageFactory } from './PersistStorage.js';

/** Explicit expiry policy, in milliseconds since the injected clock's epoch.
 * @example
 * ttlStorage(storage, { ttlMs: 60_000 });
 */
export type TTLStorageOptions = {
  readonly ttlMs: number;
  readonly now?: () => number;
};

/** Wraps storage with an explicit, tagged TTL format; unwrapped legacy entries reject.
 * Expired reads return null without deleting a possibly newer concurrent write.
 * @example
 * const storage = ttlStorage(jsonStorage(() => localStorage), { ttlMs: 60_000 });
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
