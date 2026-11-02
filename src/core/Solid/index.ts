import type { Store, StoreApi, ReadableStore } from '@ilokesto/store';
import type { ReducerState } from '../../lib/createReducer.js';

import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import type { UseReadonlyState, UseReducer, UseState } from './types.js';
export type { UseReadonlyState, UseReducer, UseState } from './types.js';
export { bindResource } from './bindResource.js';
export type { UseResource } from './bindResource.js';

import { createFrameworkAdapter } from '../shared/createFrameworkAdapter.js';
import { createPersistStatusStore } from '../shared/createPersistStatusStore.js';
import type { PersistControls, PersistStatus } from '../../middleware/persist/Persist.js';
import { createReadonlyAccessor, createUseAccessor } from './createUseAccessor.js';

/**
 * @description Creates a Solid binding from plain state, an existing store, or
 * a reducer and its initial state. The one-argument overload creates a state
 * binding; the two-argument overload creates a reducer binding.
 *
 * Returns a function that must be called inside a reactive owner (component
 * or `createRoot()`). Without a selector, `state` is an `Accessor` of a
 * read-only snapshot: object state is `Readonly<T>`, while callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 * @param {ReduceFn<T, Action>} reduceFn - Reducer supplied only to the
 * two-argument overload to compute state from dispatched actions.
 * @param {T | Store<T>} initialState - Initial value or existing store; the
 * sole argument for state bindings and the second argument for reducer bindings.
 * @returns {UseState<T> | UseReducer<T, Action>} Callable Solid binding with
 * state writers or reducer dispatch, according to the selected overload.
 * - writeOnly `UseState<T>['writeOnly'] | UseReducer<T, Action>['writeOnly']` - Provides the state writer or reducer dispatch without a reactive state subscription.
 * - readOnly `UseState<T>['readOnly'] | UseReducer<T, Action>['readOnly']` - Reads a snapshot synchronously without subscribing or requiring a reactive owner.
 * @example
 * ```ts
 * import { createRoot } from 'solid-js';
 *
 * const useCount = create(0);
 * const useReducerCount = create(
 *   (count: number, action: { type: 'increment' }) =>
 *     action.type === 'increment' ? count + 1 : count,
 *   0,
 * );
 *
 * createRoot((dispose) => {
 *   const count = useCount();
 *   const reducerCount = useReducerCount();
 *   dispose();
 * });
 * ```
 */
export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

/**
 * @description Creates a Solid binding from plain state, an existing store, or
 * a reducer and its initial state. The one-argument overload creates a state
 * binding; the two-argument overload creates a reducer binding.
 *
 * Returns a function that must be called inside a reactive owner (component
 * or `createRoot()`). Without a selector, `state` is an `Accessor` of a
 * read-only snapshot: object state is `Readonly<T>`, while callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 * @param {ReduceFn<T, Action>} reduceFn - Reducer supplied only to the
 * two-argument overload to compute state from dispatched actions.
 * @param {T | Store<T>} initialState - Initial value or existing store; the
 * sole argument for state bindings and the second argument for reducer bindings.
 * @returns {UseState<T> | UseReducer<T, Action>} Callable Solid binding with
 * state writers or reducer dispatch, according to the selected overload.
 * - writeOnly `UseState<T>['writeOnly'] | UseReducer<T, Action>['writeOnly']` - Provides the state writer or reducer dispatch without a reactive state subscription.
 * - readOnly `UseState<T>['readOnly'] | UseReducer<T, Action>['readOnly']` - Reads a snapshot synchronously without subscribing or requiring a reactive owner.
 * @example
 * ```ts
 * import { createRoot } from 'solid-js';
 *
 * const useCount = create(0);
 * const useReducerCount = create(
 *   (count: number, action: { type: 'increment' }) =>
 *     action.type === 'increment' ? count + 1 : count,
 *   0,
 * );
 *
 * createRoot((dispose) => {
 *   const count = useCount();
 *   const reducerCount = useReducerCount();
 *   dispose();
 * });
 * ```
 */
export function create<T>(initialState: T | Store<T>): UseState<T>;

export function create<T, Action extends ReducerAction>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
) {
  return createFrameworkAdapter(
    createUseAccessor<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}

/**
 * @description Binds an existing structural store to Solid without recreating
 * the store or inspecting its value. Call the returned binding inside a
 * component or another reactive owner.
 * @param {StoreApi<T>} store - Existing store supplying state, subscriptions,
 * and writes.
 * @returns {UseState<T>} Callable Solid state binding for the supplied store.
 * - writeOnly `UseState<T>['writeOnly']` - Provides the state writer without a reactive state subscription.
 * - readOnly `UseState<T>['readOnly']` - Reads the store snapshot synchronously without subscribing or requiring a reactive owner.
 * @example
 * ```ts
 * import { createRoot } from 'solid-js';
 * import type { StoreApi } from '@ilokesto/store';
 *
 * function observeCount(store: StoreApi<number>) {
 *   const useCount = bind(store);
 *   return createRoot((dispose) => {
 *     const count = useCount.readOnly();
 *     console.log(count);
 *     return dispose;
 *   });
 * }
 * ```
 */
export function bind<T>(store: StoreApi<T>): UseState<T>;
export function bind<T>(store: StoreApi<T>) {
  return createUseAccessor<T, never>(store, false);
}

/**
 * @description Binds an explicit reducer handle to Solid without registering
 * the reducer again. The binding reads the supplied store and uses the supplied
 * dispatch function. Call it inside a component or another reactive owner.
 * @param {ReducerState<T, Action>} state - Existing reducer handle to bind.
 * @param {StoreApi<T>} state.store - Store containing the reducer's current state.
 * @param {(action: Action) => void} state.dispatch - Dispatch function used to send actions to the existing reducer.
 * @returns {UseReducer<T, Action>} Callable Solid binding for the reducer handle.
 * - writeOnly `UseReducer<T, Action>['writeOnly']` - Provides reducer dispatch without a reactive state subscription.
 * - readOnly `UseReducer<T, Action>['readOnly']` - Reads the reducer's state snapshot synchronously without subscribing or requiring a reactive owner.
 * @example
 * ```ts
 * import { createRoot } from 'solid-js';
 *
 * function observeCounter(
 *   state: ReducerState<number, { type: 'increment' }>,
 * ) {
 *   const useCounter = bindReducer(state);
 *   return createRoot((dispose) => {
 *     const count = useCounter.readOnly();
 *     console.log(count);
 *     return dispose;
 *   });
 * }
 * ```
 */
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>): UseReducer<T, Action>;
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>) {
  return createUseAccessor<T, Action>(state.store, true, state.dispatch);
}

/**
 * @description Binds a structural readable store to Solid without exposing
 * writers. Call the returned binding inside a component or another reactive owner.
 * @param {ReadableStore<T>} store - Readable store supplying snapshots and subscriptions.
 * @returns {UseReadonlyState<T>} Callable read-only Solid binding.
 * - readOnly `UseReadonlyState<T>['readOnly']` - Reads the store snapshot synchronously without subscribing or requiring a reactive owner.
 * @example
 * ```ts
 * import { createRoot } from 'solid-js';
 * import type { ReadableStore } from '@ilokesto/store';
 *
 * function observeTemperature(store: ReadableStore<number>) {
 *   const useTemperature = bindReadonly(store);
 *   return createRoot((dispose) => {
 *     const temperature = useTemperature.readOnly();
 *     console.log(temperature);
 *     return dispose;
 *   });
 * }
 * ```
 */
export function bindReadonly<T>(store: ReadableStore<T>): UseReadonlyState<T> {
  return createReadonlyAccessor(store);
}

/**
 * @description Binds borrowed persistence status to a read-only Solid binding.
 * Call the binding inside a component or another reactive owner. Owner cleanup
 * releases its subscription but never disposes persistence.
 * @param {Pick<PersistControls, 'getStatus' | 'subscribe'>} persist - Borrowed persistence status controls.
 * @param {(listener: (status: PersistStatus) => void) => () => void} persist.subscribe - Subscribes to status changes and returns an unsubscribe function.
 * @param {() => PersistStatus} persist.getStatus - Reads the current persistence status.
 * @returns {UseReadonlyState<PersistStatus>} Callable read-only Solid binding for persistence status.
 * - readOnly `UseReadonlyState<PersistStatus>['readOnly']` - Reads the current persistence status synchronously without subscribing or requiring a reactive owner.
 * @example
 * ```ts
 * import { createRoot } from 'solid-js';
 *
 * function observePersistence(
 *   persist: Pick<PersistControls, 'getStatus' | 'subscribe'>,
 * ) {
 *   const useStatus = bindPersistStatus(persist);
 *   return createRoot((dispose) => {
 *     const status = useStatus.readOnly();
 *     console.log(status);
 *     return dispose;
 *   });
 * }
 * ```
 */
export function bindPersistStatus(
  persist: Pick<PersistControls, 'getStatus' | 'subscribe'>,
): UseReadonlyState<PersistStatus> {
  return bindReadonly(createPersistStatusStore(persist));
}
