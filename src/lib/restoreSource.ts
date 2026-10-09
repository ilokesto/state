/** Internal identity shared by restoration observers, never a global mode. */
export const restoreSource = Symbol('state restoration');

const baselines = new WeakMap<object, () => void>();

export function registerRestoreBaseline(store: object, reset: () => void): () => void {
  baselines.set(store, reset);
  return () => { baselines.delete(store); };
}

export function resetRestoreBaseline(store: object): void {
  baselines.get(store)?.();
}
