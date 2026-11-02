import type { Unsubscribe } from '@ilokesto/store';
import { createSnapshotBridge, type SnapshotBridge } from '../lib/createSnapshotBridge.js';

/** The observer is borrowed; cache, fetching, retries and options remain caller-owned. */
export interface QueryObserverSource<T> {
  /** Returns the observer's current result without transforming it. */
  getCurrentResult(): T;
  /** Registers a result listener and returns a function that removes it. */
  subscribe(listener: (result: T) => void): Unsubscribe;
}

/**
 * @description Mirrors an observer's exact result objects without importing a
 * query runtime. Reads the current result and subscribes to observer changes.
 * The observer is borrowed; cache, fetching, retries and options remain
 * caller-owned.
 * @param {QueryObserverSource<T>} observer - Observer supplying results and change notifications.
 * @param {() => T} observer.getCurrentResult - Reads the current result to mirror.
 * @param {(listener: (result: T) => void) => Unsubscribe} observer.subscribe - Registers a listener that triggers a fresh read; returns its unsubscribe function.
 * @returns {SnapshotBridge<T>} The snapshot store and its lifecycle controls.
 * - store `SnapshotBridge<T>['store']` - Store holding the observer's current result without transforming it.
 * - refresh `SnapshotBridge<T>['refresh']` - Reads the observer's current result and synchronizes the store.
 * - dispose `SnapshotBridge<T>['dispose']` - Releases the bridge's observer subscription.
 * @example
 * ```ts
 * const bridge = createQueryBridge({
 *   getCurrentResult: () => navigator.onLine,
 *   subscribe(listener) {
 *     const notify = () => listener(navigator.onLine);
 *     window.addEventListener('online', notify);
 *     window.addEventListener('offline', notify);
 *     return () => {
 *       window.removeEventListener('online', notify);
 *       window.removeEventListener('offline', notify);
 *     };
 *   },
 * });
 *
 * bridge.refresh();
 * // When the consuming view is removed:
 * bridge.dispose();
 * ```
 */
export function createQueryBridge<T>(observer: QueryObserverSource<T>): SnapshotBridge<T> {
  return createSnapshotBridge(
    () => observer.getCurrentResult(),
    (refresh) => observer.subscribe(refresh),
  );
}
