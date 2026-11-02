/** Internal identity shared by restoration observers, never a global mode. */
export const restoreSource = Symbol('state restoration');
/** Debugger restoration resets history but still needs normal persistence writes. */
export const devtoolsRestoreSource = Symbol('devtools restoration');

const baselines = new WeakMap<object, () => void>();

/**
 * @description Registers a restoration baseline reset callback for a store identity,
 * replacing any previously registered callback. The returned cleanup deletes the
 * store's current registration, even if it has since been replaced.
 * @param {object} store - Store identity used as the weak registration key.
 * @param {() => void} reset - Callback invoked when this store's baseline is reset.
 * @returns {() => void} Cleanup function that deletes the store's registration.
 * @example
 * ```ts
 * const store = {};
 * let baseline = 10;
 * const unregister = registerRestoreBaseline(store, () => {
 *   baseline = 0;
 * });
 * resetRestoreBaseline(store);
 * // baseline is now 0.
 * unregister();
 * ```
 */
export function registerRestoreBaseline(store: object, reset: () => void): () => void {
  baselines.set(store, reset);
  return () => { baselines.delete(store); };
}

/**
 * @description Invokes the store's registered baseline reset callback synchronously,
 * if present, without removing it. Does nothing when no callback is registered;
 * errors thrown by the callback propagate to the caller.
 * @param {object} store - Store identity whose registered baseline should be reset.
 * @example
 * ```ts
 * const store = {};
 * let baseline = 5;
 * const unregister = registerRestoreBaseline(store, () => {
 *   baseline = 0;
 * });
 * resetRestoreBaseline(store);
 * // baseline is now 0; the callback remains registered.
 * unregister();
 * resetRestoreBaseline(store); // No callback is invoked.
 * ```
 */
export function resetRestoreBaseline(store: object): void {
  baselines.get(store)?.();
}
