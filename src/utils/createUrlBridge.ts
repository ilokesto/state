import { createSnapshotBridge, type SnapshotBridge } from '../lib/createSnapshotBridge.js';

/** Throw from parse for invalid input; serialize null to remove the parameter. */
export interface UrlCodec<T> {
  parse(value: string): T;
  serialize(value: T): string | null;
}

/** A Window satisfies this interface, but no browser global is read implicitly. */
export interface UrlEnvironment {
  readonly location: { readonly href: string };
  readonly history: {
    readonly state: unknown;
    pushState(state: unknown, unused: string, url: string): void;
    replaceState(state: unknown, unused: string, url: string): void;
  };
  addEventListener(type: 'popstate', listener: () => void): void;
  removeEventListener(type: 'popstate', listener: () => void): void;
}

export type UrlHistoryMode = 'replace' | 'push';

export type UrlBridgeOptions<T> = {
  readonly key: string;
  readonly codec: UrlCodec<T>;
  readonly defaultValue: T;
  readonly environment?: UrlEnvironment;
  /** Absolute URL for SSR or an isolated in-memory bridge. */
  readonly url?: string | URL;
  readonly history?: UrlHistoryMode;
};

export type UrlBridge<T> = SnapshotBridge<T> & {
  readonly set: (value: T, history?: UrlHistoryMode) => void;
};

/** Connect one search parameter to a readonly store and explicit history writes. */
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
