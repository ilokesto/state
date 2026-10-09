import type { PersistStorageFactory } from './PersistStorage.js';
import { serializeJsonValue } from './serializeJsonValue.js';

/**
 * Attributes shared by cookie writes and deletion.
 * @example
 * const options: CookieStorageOptions = { path: '/', sameSite: 'Lax', secure: true };
 */
export type CookieStorageOptions = {
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
 * Creates a lazy JSON cookie adapter factory with legacy encoding support.
 * No document access occurs until an adapter operation is invoked.
 * @param options - Cookie attributes; use the same path/domain to read and delete.
 * @example
 * persist({ key: 'preferences', storage: cookieStorage({ path: '/' }), decode });
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
      const parsed: unknown = JSON.parse(value);
      if (parsed === null) {
        throw new TypeError('Stored cookie must contain a persistence envelope');
      }
      return parsed;
    },
    async setItem(key, value) {
      const serialized = serializeJsonValue(value);
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
