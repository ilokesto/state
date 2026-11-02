import type { ReadableStore, StoreApi } from '@ilokesto/store';
import { dispose } from './storeCleanup.js';

/** An explicit owner. Framework subscriptions keep their own lifecycle. */
export type StateScope = {
  /** Whether disposal has started; remains true even if cleanup throws. */
  readonly disposed: boolean;
  /**
   * Calls the factory and registers its returned store for cleanup, preserving
   * its identity. Throws if the scope is closed or another scope owns the store.
   * If the factory closes this scope, cleans up the returned store and throws,
   * except that stores owned by another scope are rejected without cleanup.
   */
  create<Instance extends StoreApi<Instance extends StoreApi<infer State> ? State : never>>(factory: () => Instance): Instance;
  /**
   * Returns the store unchanged without claiming ownership or registering cleanup.
   * Throws if this scope is disposed.
   */
  borrow<Instance extends ReadableStore<NonNullable<unknown> | null | undefined>>(store: Instance): Instance;
  /**
   * Marks this scope disposed and runs each owned store's cleanup in reverse
   * registration order. Attempts all cleanup and throws an AggregateError if
   * any cleanup fails. Subsequent calls do nothing.
   */
  dispose(): void;
};

const owners = new WeakMap<object, StateScope>();

/**
 * @description Creates an explicit store owner for one request or application
 * lifetime.
 *
 * Only stores returned by `create` are owned. `borrow` preserves identity without
 * registering cleanup. Disposal runs owned middleware cleanup in reverse order;
 * it neither flushes persistence nor removes consumer-owned subscriptions.
 * Creating or borrowing after disposal throws. Creation also rejects stores
 * owned by another scope. If a factory disposes its scope before returning,
 * creation throws and the returned store is cleaned up unless another scope owns it.
 * Disposal marks the scope closed before cleanup, attempts every cleanup, and
 * throws an AggregateError if any fail. Repeated disposal does nothing.
 *
 * @returns {StateScope} A new, initially open scope.
 * - disposed `boolean` - Whether disposal has started, including when cleanup fails.
 * - create `StateScope['create']` - Calls a factory and returns its store unchanged, registering it for owned cleanup.
 * - borrow `StateScope['borrow']` - Returns a store unchanged without taking ownership; requires an open scope.
 * - dispose `StateScope['dispose']` - Closes the scope and cleans up owned stores in reverse registration order.
 * @example
 * ```ts
 * const scope = createScope();
 * try {
 *   // Pass your application's store factory to register owned cleanup.
 *   const sessionStore = scope.create(createSessionStore);
 *   // Borrowing preserves identity without adding cleanup registration.
 *   const sameStore = scope.borrow(sessionStore);
 *   console.assert(sameStore === sessionStore);
 * } finally {
 *   scope.dispose();
 * }
 * console.assert(scope.disposed);
 * ```
 */
export function createScope(): StateScope {
  let disposed = false;
  const stores = new Map<object, () => void>();
  const assertOpen = () => {
    if (disposed) {
      throw new Error('State scope is disposed');
    }
  };

  const scope: StateScope = {
    get disposed() {
      return disposed;
    },
    create(factory) {
      assertOpen();
      const store = factory();
      const owner = owners.get(store);
      if (owner && owner !== scope) {
        throw new Error('Store already belongs to another state scope');
      }
      if (disposed) {
        // A factory can synchronously close its scope before returning.
        dispose(store);
        throw new Error('State scope was disposed during store creation');
      }
      owners.set(store, scope);
      stores.set(store, () => dispose(store));
      return store;
    },
    borrow(store) {
      assertOpen();
      return store;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      const errors: unknown[] = [];
      const owned = [...stores.values()].reverse();
      stores.clear();
      for (const cleanup of owned) {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, 'State scope cleanup failed');
      }
    },
  };
  return scope;
}
