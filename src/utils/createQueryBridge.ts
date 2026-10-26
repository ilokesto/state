import type { Unsubscribe } from '@ilokesto/store';
import { createSnapshotBridge, type SnapshotBridge } from '../lib/createSnapshotBridge.js';

/** The observer is borrowed; cache, fetching, retries and options remain caller-owned. */
export interface QueryObserverSource<T> {
  getCurrentResult(): T;
  subscribe(listener: (result: T) => void): Unsubscribe;
}

/** Mirror an observer's exact result objects without importing a query runtime. */
export function createQueryBridge<T>(observer: QueryObserverSource<T>): SnapshotBridge<T> {
  return createSnapshotBridge(
    () => observer.getCurrentResult(),
    (refresh) => observer.subscribe(refresh),
  );
}
