import { Store, type ReadableStore } from '@ilokesto/store';
import type { PersistControls, PersistStatus } from '../../middleware/persist/Persist.js';

/** Translate the borrowed status protocol; each subscriber owns its bridge. */
export function createPersistStatusStore(
  persist: Pick<PersistControls, 'getStatus' | 'subscribe'>,
): ReadableStore<PersistStatus> {
  const initialStatus = persist.getStatus();

  function subscribe(
    connect: (store: Store<PersistStatus>) => () => void,
  ): () => void {
    const store = new Store(persist.getStatus());
    const disconnect = connect(store);
    const unsubscribe = persist.subscribe(status => store.set(status));
    // Reconcile a change between the first read and attaching the source.
    store.set(persist.getStatus());
    return () => {
      unsubscribe();
      disconnect();
    };
  }

  return {
    getState: () => persist.getStatus(),
    getInitialState: () => initialStatus,
    subscribe: listener => subscribe(store => store.subscribe(listener)),
    subscribeSelector: (selector, listener, equality) =>
      subscribe(store => store.subscribeSelector(selector, listener, equality)),
  };
}
