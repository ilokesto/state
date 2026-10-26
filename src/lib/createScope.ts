import type { ReadableStore, StoreApi } from '@ilokesto/store';
import { dispose } from './storeCleanup.js';

/** An explicit owner. Framework subscriptions keep their own lifecycle. */
export type StateScope = {
  readonly disposed: boolean;
  create<Instance extends StoreApi<Instance extends StoreApi<infer State> ? State : never>>(factory: () => Instance): Instance;
  borrow<Instance extends ReadableStore<NonNullable<unknown> | null | undefined>>(store: Instance): Instance;
  dispose(): void;
};

const owners = new WeakMap<object, StateScope>();

/**
 * Create one scope per request or application lifetime.
 *
 * Only stores returned by `create` are owned. `borrow` preserves identity without
 * registering cleanup. Disposal runs owned middleware cleanup in reverse order;
 * it neither flushes persistence nor removes consumer-owned subscriptions.
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
