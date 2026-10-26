import { createStore, type ReadableStore, type Unsubscribe } from '@ilokesto/store';

/** A readonly mirror with an explicit, independent subscription lifetime. */
export type SnapshotBridge<T> = {
  readonly store: ReadableStore<T>;
  readonly refresh: () => void;
  readonly dispose: () => void;
};

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
