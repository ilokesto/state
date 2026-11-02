import { Store, createStore } from '@ilokesto/store';
import { getDispatchedStoreAction } from './actionMetadata.js';
import type { ReduceFn, ReducerAction } from '../types/ReduceFn.js';

type StoreSetStateAction<T> = Parameters<Store<T>['setState']>[0];

const reducerByStore = new WeakMap<object, (...args: never[]) => unknown>();

const isStore = <T>(initialValue: T | Store<T>): initialValue is Store<T> => {
  return initialValue instanceof Store;
};

/**
 * @description Tests whether a value is exactly the action currently recorded as
 * dispatched for this store. This checks dispatch metadata, not the value's shape.
 * @param {Store<T>} store - Store whose dispatched-action metadata is checked.
 * @param {unknown} value - Candidate value to compare with the recorded action.
 * @returns {boolean} Whether the recorded value strictly equals the candidate;
 * a true result narrows the candidate to Action.
 * @example
 * ```ts
 * const store = getStore(0);
 * const candidate: unknown = { type: 'increment' };
 * const matches = isStoreAction<number, { type: 'increment' }>(store, candidate);
 * // An unrecorded action-shaped object does not match.
 * ```
 */
export const isStoreAction = <T, Action extends ReducerAction>(
  store: Store<T>,
  value: unknown,
): value is Action => {
  return getDispatchedStoreAction(store) === value;
};

/**
 * @description Returns an existing Store unchanged or creates one from an initial
 * state. When supplied, the reducer is registered once as prepended middleware:
 * values matching the store's dispatched-action metadata are reduced against the
 * current state, while other updates pass through unchanged. Function-valued
 * reducer results are wrapped so they are stored rather than invoked as updaters.
 * Registering the same reducer again is harmless; registering a different reducer
 * for the same store throws a TypeError. Omitting the reducer leaves any existing
 * registration intact.
 * @param {T | Store<T>} initState - Initial state for a new store, or an existing
 * store to reuse.
 * @param {ReduceFn<T, Action> | undefined} [reduceFn] - Reducer to register for
 * dispatched actions on the resulting store.
 * @returns {Store<T>} The supplied store or a newly created store, with reducer
 * middleware registered when requested.
 * @example
 * ```ts
 * type CounterAction = { type: 'increment' };
 * const reduceCounter = (state: number, action: CounterAction): number =>
 *   action.type === 'increment' ? state + 1 : state;
 *
 * const store = getStore(0, reduceCounter);
 * const reused = getStore(store, reduceCounter);
 * console.assert(reused === store);
 * console.assert(store.getState() === 0);
 * ```
 */
export const getStore = <T, Action extends ReducerAction>(
  initState: T | Store<T>,
  reduceFn?: ReduceFn<T, Action>,
): Store<T> => {
  const store = isStore(initState) ? initState : createStore(initState);

  if (reduceFn) {
    const registeredReducer = reducerByStore.get(store);

    if (registeredReducer !== undefined) {
      if (registeredReducer !== reduceFn) {
        throw new TypeError('Cannot register a different reducer for the same Store.');
      }

      return store;
    }

    store.unshiftMiddleware((nextState: StoreSetStateAction<T>, next) => {
      if (!isStoreAction<T, Action>(store, nextState)) {
        next(nextState);
        return;
      }

      const currentState = store.getState();
      const reducedState = reduceFn(currentState, nextState);
      next(typeof reducedState === 'function' ? () => reducedState : reducedState);
    });
    reducerByStore.set(store, reduceFn);
  }

  return store;
};
