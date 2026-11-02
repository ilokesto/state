const cancellations = new WeakMap<object, Set<() => void>>();
const replaying = new WeakMap<object, boolean>();

/**
 * @description Registers a timer cancellation callback for a store identity.
 * Registering the same callback again does not duplicate it. Callbacks remain
 * registered after cancellation.
 * @param {object} store - Store identity that owns the timer.
 * @param {() => void} cancel - Callback invoked when the store's timers are cancelled.
 * @example
 * ```ts
 * const store = {};
 * const timeout = setTimeout(() => console.log("Saved"), 100);
 * registerTimerCancellation(store, () => clearTimeout(timeout));
 * cancelStoreTimers(store);
 * ```
 */
export function registerTimerCancellation(store: object, cancel: () => void): void {
  const callbacks = cancellations.get(store) ?? new Set<() => void>();
  callbacks.add(cancel);
  cancellations.set(store, callbacks);
}

/**
 * @description Synchronously invokes the store's registered cancellation callbacks
 * in insertion order without removing them. Does nothing if none are registered.
 * If a callback throws, the error propagates and remaining callbacks are not invoked.
 * @param {object} store - Store identity whose registered timers should be cancelled.
 * @example
 * ```ts
 * const store = {};
 * const timeout = setTimeout(() => console.log("Updated"), 100);
 * registerTimerCancellation(store, () => clearTimeout(timeout));
 * cancelStoreTimers(store);
 * ```
 */
export function cancelStoreTimers(store: object): void {
  for (const cancel of cancellations.get(store) ?? []) cancel();
}

/**
 * @description Reports whether the store's current synchronous replay scope is
 * marked as a timer replay. Returns false outside a scope or in a scope marked false.
 * @param {object} store - Store identity whose replay state is inspected.
 * @returns {boolean} Whether the store's current replay flag is true.
 * @example
 * ```ts
 * const store = {};
 * runWithTimerReplay(store, true, () => {
 *   console.log(isTimerReplay(store)); // true
 * });
 * console.log(isTimerReplay(store)); // false
 * ```
 */
export function isTimerReplay(store: object): boolean {
  return replaying.get(store) === true;
}

/**
 * @description Runs an action synchronously with the store's replay flag set to
 * the supplied value, restoring its previous state even if the action throws.
 * Errors propagate to the caller. Each dispatch masks its parent, so user writes
 * from replay subscribers still obey timing. Validation may replace the action
 * before it reaches a timer. The scope does not extend to asynchronous work.
 * @param {object} store - Store identity whose replay flag is temporarily changed.
 * @param {boolean} replay - Replay flag to expose while the action runs.
 * @param {() => void} action - Synchronous action to execute within the replay scope.
 * @example
 * ```ts
 * const store = {};
 * runWithTimerReplay(store, true, () => {
 *   console.log(isTimerReplay(store)); // true
 *   runWithTimerReplay(store, false, () => {
 *     console.log(isTimerReplay(store)); // false
 *   });
 *   console.log(isTimerReplay(store)); // true
 * });
 * console.log(isTimerReplay(store)); // false
 * ```
 */
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
