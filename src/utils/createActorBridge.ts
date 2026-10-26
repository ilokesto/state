import { createSnapshotBridge, type SnapshotBridge } from '../lib/createSnapshotBridge.js';

/** Structural actor protocol; starting and stopping the actor belongs to its owner. */
export interface ActorSource<T, Event> {
  getSnapshot(): T;
  subscribe(observer: {
    next(snapshot: T): void;
    error(error: unknown): void;
    complete(): void;
  }): { unsubscribe(): void };
  send(event: Event): void;
}

export type ActorBridge<T, Event> = SnapshotBridge<T> & {
  readonly send: (event: Event) => void;
};

/** Read snapshots separately from sending events; disposal never stops the actor. */
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
