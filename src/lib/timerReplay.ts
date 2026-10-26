const cancellations = new WeakMap<object, Set<() => void>>();
const replaying = new WeakMap<object, boolean>();

export function registerTimerCancellation(store: object, cancel: () => void): void {
  const callbacks = cancellations.get(store) ?? new Set<() => void>();
  callbacks.add(cancel);
  cancellations.set(store, callbacks);
}

export function cancelStoreTimers(store: object): void {
  for (const cancel of cancellations.get(store) ?? []) cancel();
}

export function isTimerReplay(store: object): boolean {
  return replaying.get(store) === true;
}

// Each dispatch masks its parent, so user writes from replay subscribers still
// obey timing. Validation may replace the action before it reaches a timer.
export function runWithTimerReplay(store: object, replay: boolean, action: () => void): void {
  const previous = replaying.get(store);
  replaying.set(store, replay);
  try {
    action();
  } finally {
    if (previous === undefined) replaying.delete(store);
    else replaying.set(store, previous);
  }
}
