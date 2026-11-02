import { Store, type ReadableStore } from '@ilokesto/store';
import type { PersistControls, PersistStatus } from '../../middleware/persist/Persist.js';

/**
 * @description Adapts the borrowed persistence status protocol to a readable store;
 * each subscriber owns its bridge. Captures the initial status when created,
 * reads the current status directly from persistence, and reconciles changes
 * while attaching each subscription. Unsubscribing releases that subscriber's
 * persistence subscription and store connection.
 * @param {Pick<PersistControls, 'getStatus' | 'subscribe'>} persist - Persistence status source.
 * @param {(listener: (status: PersistStatus) => void) => () => void} persist.subscribe - Registers a status listener and returns its unsubscribe function.
 * @param {() => PersistStatus} persist.getStatus - Reads the latest persistence status, including during nested publications.
 * @returns {ReadableStore<PersistStatus>} Readable status store with the creation-time initial status, live reads, and independent subscription bridges.
 * @example
 * ```ts
 * const statusStore = createPersistStatusStore(persist);
 * const initialStatus = statusStore.getInitialState();
 * const unsubscribe = statusStore.subscribe(() => {
 *   console.log('Persistence status:', statusStore.getState());
 * });
 * console.log('Initial persistence status:', initialStatus);
 * unsubscribe();
 * ```
 */
export function createPersistStatusStore(
  persist: Pick<PersistControls, 'getStatus' | 'subscribe'>,
): ReadableStore<PersistStatus> {
  const initialStatus = persist.getStatus();

  function subscribe(
    connect: (store: Store<PersistStatus>) => () => void,
  ): () => void {
    const store = new Store(persist.getStatus());
    const disconnect = connect(store);
    // Nested publications can finish before an older callback reaches this view.
    const unsubscribe = persist.subscribe(() => store.set(persist.getStatus()));
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
