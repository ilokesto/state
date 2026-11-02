import { createStore, type ReadableStore, type Unsubscribe } from '@ilokesto/store';

/** A readonly mirror with an explicit, independent subscription lifetime. */
export type SnapshotBridge<T> = {
  /** Readonly store containing the latest successfully mirrored snapshot. */
  readonly store: ReadableStore<T>;
  /** Reads and updates the mirror synchronously; does nothing after disposal. */
  readonly refresh: () => void;
  /** Unsubscribes from the source once and prevents future refreshes. */
  readonly dispose: () => void;
};

/**
 * @description Creates a readonly store from an initial synchronous read, then
 * subscribes to source changes and reads again to capture changes made during
 * subscription. Refreshes update the mirror until disposal. Disposal unsubscribes
 * at most once and leaves the last snapshot readable. If the post-subscription
 * refresh throws, the bridge is disposed and the error is rethrown.
 * @param {() => T} read - Reads the current source snapshot synchronously.
 * @param {(refresh: () => void) => Unsubscribe} subscribe - Registers the supplied
 * refresh callback for source changes and returns the source cleanup function.
 * @returns {SnapshotBridge<T>} The readonly mirror and its lifetime controls.
 * - store `ReadableStore<T>` - Store initialized with the first read and updated
 * by subsequent successful refreshes.
 * - refresh `() => void` - Reads the source and updates the mirror unless disposed.
 * - dispose `() => void` - Disables refreshes and invokes source cleanup at most once.
 * @example
 * ```ts
 * let count = 0;
 * const listeners = new Set<() => void>();
 * const bridge = createSnapshotBridge(
 *   () => count,
 *   (refresh) => {
 *     listeners.add(refresh);
 *     return () => { listeners.delete(refresh); };
 *   },
 * );
 *
 * count = 1;
 * listeners.forEach((refresh) => refresh());
 * console.log(bridge.store.getState()); // 1
 *
 * count = 2;
 * bridge.refresh();
 * console.log(bridge.store.getState()); // 2
 * bridge.dispose();
 * ```
 */
export function createSnapshotBridge<T>(
  read: () => T,
  subscribe: (refresh: () => void) => Unsubscribe,
): SnapshotBridge<T> {
  const mirror = createStore(read());
  let disposed = false;
  const refresh = () => {
    if (!disposed) {
      mirror.set(read());
    }
  };
  const unsubscribe = subscribe(refresh);
  const dispose = () => {
    if (!disposed) {
      disposed = true;
      unsubscribe();
    }
  };

  try {
    // Subscribing can itself change the source without emitting a notification.
    refresh();
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    store: {
      getState: () => mirror.getState(),
      getInitialState: () => mirror.getInitialState(),
      subscribe: (listener) => mirror.subscribe(listener),
      subscribeSelector: (selector, listener, equality) =>
        mirror.subscribeSelector(selector, listener, equality),
    },
    refresh,
    dispose,
  };
}
