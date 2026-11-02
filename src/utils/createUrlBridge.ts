import { createSnapshotBridge, type SnapshotBridge } from '../lib/createSnapshotBridge.js';

/** Throw from parse for invalid input; serialize null to remove the parameter. */
export interface UrlCodec<T> {
  /** Decode a search-parameter value, throwing if the input is invalid. */
  parse(value: string): T;
  /** Encode a value, or return null to remove the search parameter. */
  serialize(value: T): string | null;
}

/** A Window satisfies this interface, but no browser global is read implicitly. */
export interface UrlEnvironment {
  /** Source of the current absolute URL, read again on each refresh or write. */
  readonly location: {
    /** Current absolute URL, including its search parameters and fragment. */
    readonly href: string
  };
  /** History operations used to write URLs while preserving current state. */
  readonly history: {
    /** Current history state, passed unchanged to either write operation. */
    readonly state: unknown;
    /** Add a history entry using the supplied state, unused title, and URL. */
    pushState(state: unknown, unused: string, url: string): void;
    /** Replace the current entry using the supplied state, unused title, and URL. */
    replaceState(state: unknown, unused: string, url: string): void;
  };
  /** Register the refresh listener for browser history navigation. */
  addEventListener(type: 'popstate', listener: () => void): void;
  /** Unregister a previously registered history-navigation listener. */
  removeEventListener(type: 'popstate', listener: () => void): void;
}

/** Whether a URL write replaces the current history entry or adds one. */
export type UrlHistoryMode = 'replace' | 'push';

export type UrlBridgeOptions<T> = {
  /** Search-parameter name to read, update, or remove. */
  readonly key: string;
  /** Decoder and encoder used for this parameter. */
  readonly codec: UrlCodec<T>;
  /** Value used when the parameter is absent or decoding throws. */
  readonly defaultValue: T;
  /** Explicit browser-like environment; omit to keep URL changes in memory. */
  readonly environment?: UrlEnvironment;
  /** Absolute URL for SSR or an isolated in-memory bridge. */
  readonly url?: string | URL;
  /** Default write mode; defaults to replacing the current history entry. */
  readonly history?: UrlHistoryMode;
};

/** Snapshot bridge with an explicit operation for writing its URL parameter. */
export type UrlBridge<T> = SnapshotBridge<T> & {
  /**
   * Serialize and validate a value, update the URL, then refresh the snapshot.
   * The optional history mode overrides the configured default for this write.
   * Throws after disposal or if serialization, validation, or the URL write fails.
   */
  readonly set: (value: T, history?: UrlHistoryMode) => void;
};

/**
 * @description Connect one search parameter to a readonly store and explicit
 * history writes. Missing parameters and parse failures read as defaultValue.
 * An explicit environment supplies the live URL and popstate notifications;
 * otherwise changes remain in an isolated in-memory URL. No browser global is
 * read implicitly. The supplied URL is constructed even when an environment is
 * present, so it must be absolute; it defaults to http://localhost/.
 *
 * Writes serialize the value and, unless serialization returns null, parse the
 * result before touching history or the mirror. A null result removes the
 * parameter. Successful writes refresh the snapshot and preserve other URL
 * components and the environment's history state. Serialization, validation,
 * and history-write errors propagate. Disposal releases the snapshot bridge's
 * resources and makes subsequent set calls throw.
 * @param {UrlBridgeOptions<T>} options - Parameter binding and URL configuration.
 * @param {string} options.key - Search-parameter name to bind.
 * @param {UrlCodec<T>} options.codec - Conversion between parameter text and values.
 * @param {(value: string) => T} options.codec.parse - Decode text; throw for invalid input.
 * @param {(value: T) => string | null} options.codec.serialize - Encode a value, or return null to remove the parameter.
 * @param {T} options.defaultValue - Fallback for an absent parameter or a parse failure.
 * @param {UrlEnvironment} [options.environment] - Explicit live URL and history adapter; omit for in-memory operation.
 * @param {UrlEnvironment['location']} [options.environment.location] - Source of the current URL.
 * @param {string} [options.environment.location.href] - Current absolute URL.
 * @param {UrlEnvironment['history']} [options.environment.history] - History state and URL-writing operations.
 * @param {unknown} [options.environment.history.state] - State preserved during each history write.
 * @param {(state: unknown, unused: string, url: string) => void} [options.environment.history.pushState] - Add an entry with the current state, an empty title, and the updated URL.
 * @param {(state: unknown, unused: string, url: string) => void} [options.environment.history.replaceState] - Replace the current entry with the current state, an empty title, and the updated URL.
 * @param {(type: 'popstate', listener: () => void) => void} [options.environment.addEventListener] - Register a listener that refreshes the snapshot on navigation.
 * @param {(type: 'popstate', listener: () => void) => void} [options.environment.removeEventListener] - Remove the registered navigation listener during cleanup.
 * @param {string | URL} [options.url] - Initial absolute in-memory URL; defaults to http://localhost/ and is not the read source when an environment is supplied.
 * @param {UrlHistoryMode} [options.history] - Default write mode, either 'replace' or 'push'; defaults to 'replace'.
 * @returns {UrlBridge<T>} Readonly snapshot bridge with explicit URL writes.
 * - store `SnapshotBridge<T>['store']` - Readonly store exposing the decoded parameter snapshot.
 * - refresh `SnapshotBridge<T>['refresh']` - Re-read the URL through the snapshot bridge.
 * - dispose `SnapshotBridge<T>['dispose']` - Release bridge resources and prevent further set calls.
 * - set `(value: T, history?: UrlHistoryMode) => void` - Validate and write a value, then refresh; an optional mode overrides the default for this write.
 * @example
 * ```ts
 * const filter = createUrlBridge({
 *   key: 'filter',
 *   defaultValue: 'all',
 *   url: 'https://example.com/tasks?filter=open',
 *   codec: {
 *     parse: (text: string) => text,
 *     serialize: (value: string) => value === 'all' ? null : value,
 *   },
 * });
 *
 * filter.set('closed');
 * filter.set('all'); // Removes the filter parameter from the in-memory URL.
 * filter.refresh();
 * filter.dispose();
 * ```
 */
export function createUrlBridge<T>(options: UrlBridgeOptions<T>): UrlBridge<T> {
  const { key, codec, defaultValue, environment } = options;
  let localUrl = new URL(options.url ?? 'http://localhost/');
  const readUrl = () => environment ? new URL(environment.location.href) : localUrl;
  const bridge = createSnapshotBridge(
    () => {
      const value = readUrl().searchParams.get(key);
      if (value === null) {
        return defaultValue;
      }
      try {
        return codec.parse(value);
      } catch {
        return defaultValue;
      }
    },
    (refresh) => {
      environment?.addEventListener('popstate', refresh);
      return () => environment?.removeEventListener('popstate', refresh);
    },
  );
  let disposed = false;
  return {
    ...bridge,
    set: (value, history = options.history ?? 'replace') => {
      if (disposed) {
        throw new Error('URL bridge is disposed');
      }
      const serialized = codec.serialize(value);
      // A broken codec must fail before touching browser history or the mirror.
      if (serialized !== null) {
        codec.parse(serialized);
      }
      const url = readUrl();
      if (serialized === null) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, serialized);
      }
      if (environment) {
        const method = history === 'push' ? 'pushState' : 'replaceState';
        environment.history[method](environment.history.state, '', url.href);
      } else {
        localUrl = url;
      }
      bridge.refresh();
    },
    dispose: () => {
      disposed = true;
      bridge.dispose();
    },
  };
}
