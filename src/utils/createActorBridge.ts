import { createSnapshotBridge, type SnapshotBridge } from '../lib/createSnapshotBridge.js';

/** Structural actor protocol; starting and stopping the actor belongs to its owner. */
export interface ActorSource<T, Event> {
  /** Reads the actor's current snapshot. */
  getSnapshot(): T;
  /** Registers an observer and returns a handle for removing that subscription. */
  subscribe(observer: {
    /** Reports a new snapshot; the bridge reads it again through getSnapshot. */
    next(snapshot: T): void;
    /** Reports an actor error; the bridge uses this notification to refresh. */
    error(error: unknown): void;
    /** Reports completion; the bridge uses this notification to refresh. */
    complete(): void;
  }): {
    /** Removes this observer without stopping the actor. */
    unsubscribe(): void;
  };
  /** Sends an event to the actor. */
  send(event: Event): void;
}

export type ActorBridge<T, Event> = SnapshotBridge<T> & {
  /** Forwards an event to the actor; throws if the bridge has been disposed. */
  readonly send: (event: Event) => void;
};

/**
 * @description Bridges an actor's snapshots to a store while keeping event sending
 * separate from snapshot reads. Snapshot, error, and completion notifications
 * trigger a refresh through getSnapshot. Disposal releases the bridge's
 * subscription but never starts or stops the actor; the actor remains owned by
 * its caller. Sending through a disposed bridge throws an error.
 * @param {ActorSource<T, Event>} actor - Actor whose snapshots and events are bridged.
 * @param {() => T} actor.getSnapshot - Reads the current snapshot when the bridge refreshes.
 * @param {(observer: { next(snapshot: T): void; error(error: unknown): void; complete(): void; }) => { unsubscribe(): void; }} actor.subscribe - Registers snapshot and lifecycle notifications and returns an unsubscribe handle.
 * @param {(event: Event) => void} actor.send - Receives events forwarded by the bridge before disposal.
 * @returns {ActorBridge<T, Event>} Snapshot bridge with a guarded event sender.
 * - store `ActorBridge<T, Event>['store']` - Store exposing the bridged actor snapshot.
 * - refresh `ActorBridge<T, Event>['refresh']` - Refreshes the snapshot through the underlying snapshot bridge.
 * - dispose `ActorBridge<T, Event>['dispose']` - Disposes the snapshot bridge and disables event forwarding without stopping the actor.
 * - send `(event: Event) => void` - Forwards an event to the actor, or throws if this bridge has been disposed.
 * @example
 * ```ts
 * const listeners = new Set<(snapshot: number) => void>();
 * let count = 0;
 * const actor: ActorSource<number, { type: 'increment' }> = {
 *   getSnapshot: () => count,
 *   subscribe(observer) {
 *     const notify = (snapshot: number) => observer.next(snapshot);
 *     listeners.add(notify);
 *     return { unsubscribe: () => { listeners.delete(notify); } };
 *   },
 *   send(event) {
 *     if (event.type === 'increment') {
 *       count += 1;
 *       listeners.forEach((notify) => notify(count));
 *     }
 *   },
 * };
 *
 * const bridge = createActorBridge(actor);
 * bridge.send({ type: 'increment' });
 * bridge.dispose(); // Unsubscribes without stopping the actor.
 * ```
 */
export function createActorBridge<T, Event>(actor: ActorSource<T, Event>): ActorBridge<T, Event> {
  const bridge = createSnapshotBridge(
    () => actor.getSnapshot(),
    (refresh) => {
      const subscription = actor.subscribe({ next: refresh, error: refresh, complete: refresh });
      return () => subscription.unsubscribe();
    },
  );
  let disposed = false;
  return {
    ...bridge,
    send: (event) => {
      if (disposed) {
        throw new Error('Actor bridge is disposed');
      }
      actor.send(event);
    },
    dispose: () => {
      disposed = true;
      bridge.dispose();
    },
  };
}
