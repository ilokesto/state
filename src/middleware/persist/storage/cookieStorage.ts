import type { PersistStorageFactory } from './PersistStorage.js';
import { serializeJsonValue } from './serializeJsonValue.js';
import type { PersistCodec } from './PersistCodec.js';

/**
 * Attributes shared by cookie writes and deletion.
 * @example
 * const options: CookieStorageOptions = { path: '/', sameSite: 'Lax', secure: true };
 */
export type CookieStorageOptions = {
  /** Explicit envelope serialization; omitted retains the existing JSON format. */
  readonly codec?: PersistCodec;
  /** Cookie path. Defaults to `/`, matching the previous persist format. */
  readonly path?: string;
  /** Optional domain; omit for a host-only cookie. */
  readonly domain?: string;
  /** Lifetime in seconds; omit for a session cookie. */
  readonly maxAge?: number;
  /** Cross-site delivery policy. The browser's default applies when omitted. */
  readonly sameSite?: 'Strict' | 'Lax' | 'None';
  /** Restricts delivery to secure connections. */
  readonly secure?: boolean;
};

function readCookie(key: string): string | null {
  const entry = document.cookie.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${key}=`));
  if (entry === undefined) {
    return null;
  }
  const raw = entry.slice(key.length + 1);
  try {
    const decoded = decodeURIComponent(raw);
    return encodeURIComponent(decoded) === raw ? decoded : raw;
  } catch (error) {
    if (error instanceof URIError) {
      return raw;
    }
    throw error;
  }
}

/**
 * @description Creates a lazy cookie storage adapter factory with legacy encoding
 * support. Values use JSON by default or the supplied codec. No document access
 * occurs until an adapter operation is invoked. Reads return null for missing
 * cookies and reject decoded null envelopes. Writes and deletions are checked
 * by reading the cookie back and reject if the browser did not apply them.
 * @param {CookieStorageOptions} [options] - Serialization and cookie attributes;
 * use consistent path/domain settings when writing and deleting. Reads use
 * cookies visible to the current document.
 * @param {PersistCodec} [options.codec] - Envelope codec; omit to retain the
 * existing JSON format.
 * @param {(value: import('./PersistStorage.js').PersistedValue) => string} [options.codec.serialize] - Serializes
 * an envelope before URI encoding it for a cookie write.
 * @param {(text: string) => unknown} [options.codec.deserialize] - Decodes stored
 * text after legacy-compatible URI decoding; errors propagate to the caller.
 * @param {string} [options.path] - Cookie path for writes and deletions; defaults to `/`.
 * @param {string} [options.domain] - Cookie domain; omit for a host-only cookie.
 * @param {number} [options.maxAge] - Write lifetime in seconds; omit for a session
 * cookie. Deletion always uses a zero lifetime.
 * @param {'Strict' | 'Lax' | 'None'} [options.sameSite] - Cross-site delivery
 * policy; the browser's default applies when omitted.
 * @param {boolean} [options.secure] - Adds the Secure attribute when true,
 * restricting delivery to secure connections.
 * @returns {PersistStorageFactory} Factory producing an asynchronous cookie
 * storage adapter using these options.
 * @example
 * ```ts
 * const createStorage = cookieStorage({ path: '/', sameSite: 'Lax', secure: true });
 * const storage = createStorage();
 * const saved = await storage.getItem('preferences');
 * await storage.removeItem('preferences');
 * ```
 */
export function cookieStorage(options: CookieStorageOptions = {}): PersistStorageFactory {
  const attributes = `; path=${options.path ?? '/'}`
    + (options.domain === undefined ? '' : `; domain=${options.domain}`)
    + (options.sameSite === undefined ? '' : `; samesite=${options.sameSite}`)
    + (options.secure ? '; secure' : '');
  const lifetime = options.maxAge === undefined ? '' : `; max-age=${options.maxAge}`;
  return () => ({
    async getItem(key) {
      const value = readCookie(key);
      if (value === null) {
        return null;
      }
      const parsed: unknown = options.codec ? options.codec.deserialize(value) : JSON.parse(value);
      if (parsed === null) {
        throw new TypeError('Stored cookie must contain a persistence envelope');
      }
      return parsed;
    },
    async setItem(key, value) {
      const serialized = options.codec ? options.codec.serialize(value) : serializeJsonValue(value);
      document.cookie = `${key}=${encodeURIComponent(serialized)}${attributes}${lifetime}`;
      // Browsers silently reject oversized or disallowed cookies.
      if (readCookie(key) !== serialized) {
        throw new Error('Cookie storage write was rejected by the browser');
      }
    },
    async removeItem(key) {
      document.cookie = `${key}=${attributes}; max-age=0`;
      if (readCookie(key) !== null) {
        throw new Error('Cookie storage deletion was rejected by the browser');
      }
    },
  });
}
