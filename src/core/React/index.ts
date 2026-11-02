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
import { createReadonlyState, createUseState } from './createUseState.js';

/**
 * @description Creates a React state hook from plain state or a reducer.
 * With one argument, creates a state hook; with two arguments, creates a
 * reducer hook using the reducer and initial state.
 *
 * Returns a hook compatible with `useSyncExternalStore`. Call it with a
 * selector to subscribe to a slice; call without arguments to receive a
 * read-only first tuple item. Object state is `Readonly<T>`; callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 * @param {ReduceFn<T, Action>} reduceFn - Reducer used by the two-argument overload.
 * @param {T | Store<T>} initialState - Initial value or existing store.
 * @returns {UseReducer<T, Action> | UseState<T>} React hook with dispatch for
 * reducer state or a setter for plain state.
 * - writeOnly `UseReducer<T, Action>['writeOnly'] | UseState<T>['writeOnly']` - Hook exposing the dispatch or setter without subscribing to state.
 * - readOnly `UseReducer<T, Action>['readOnly'] | UseState<T>['readOnly']` - Reads the current snapshot without subscribing or exposing a writer.
 * @example
 * ```tsx
 * const useCounter = create({ count: 0 });
 *
 * function Counter() {
 *   const [state, setState] = useCounter();
 *   return (
 *     <button onClick={() => setState({ count: state.count + 1 })}>
 *       {state.count}
 *     </button>
 *   );
 * }
 * ```
 */
export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

/**
 * @description Creates a React state hook from plain state or a reducer.
 * With one argument, creates a state hook; with two arguments, creates a
 * reducer hook using the reducer and initial state.
 *
 * Returns a hook compatible with `useSyncExternalStore`. Call it with a
 * selector to subscribe to a slice; call without arguments to receive a
 * read-only first tuple item. Object state is `Readonly<T>`; callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 * @param {ReduceFn<T, Action>} reduceFn - Reducer used by the two-argument overload.
 * @param {T | Store<T>} initialState - Initial value or existing store.
 * @returns {UseReducer<T, Action> | UseState<T>} React hook with dispatch for
 * reducer state or a setter for plain state.
 * - writeOnly `UseReducer<T, Action>['writeOnly'] | UseState<T>['writeOnly']` - Hook exposing the dispatch or setter without subscribing to state.
 * - readOnly `UseReducer<T, Action>['readOnly'] | UseState<T>['readOnly']` - Reads the current snapshot without subscribing or exposing a writer.
 * @example
 * ```tsx
 * const useCounter = create({ count: 0 });
 *
 * function Counter() {
 *   const [state, setState] = useCounter();
 *   return (
 *     <button onClick={() => setState({ count: state.count + 1 })}>
 *       {state.count}
 *     </button>
 *   );
 * }
 * ```
 */
export function create<T>(initialState: T | Store<T>): UseState<T>;

export function create<T, Action extends ReducerAction>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
) {
  return createFrameworkAdapter(
    createUseState<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}

/**
 * @description Binds an existing structural store to a React state hook
 * without recreating the store or inspecting its value.
 * @param {StoreApi<T>} store - Existing readable and writable store to bind.
 * @returns {UseState<T>} React hook for subscribing to and updating the store.
 * - writeOnly `UseState<T>['writeOnly']` - Hook exposing the setter without subscribing to state.
 * - readOnly `UseState<T>['readOnly']` - Reads the current snapshot without subscribing or exposing a setter.
 * @example
 * ```tsx
 * import { counterStore } from './counterStore.js';
 *
 * const useCounter = bind(counterStore);
 *
 * function Counter() {
 *   const [count] = useCounter();
 *   return <span>{count}</span>;
 * }
 * ```
 */
export function bind<T>(store: StoreApi<T>): UseState<T>;
export function bind<T>(store: StoreApi<T>) {
  return createUseState<T, never>(store, false);
}

/**
 * @description Binds an explicit reducer handle to a React hook without
 * registering the reducer again. Reads use the handle's store, and writes
 * use its existing dispatch function.
 * @param {ReducerState<T, Action>} state - Existing reducer handle.
 * @param {StoreApi<T>} state.store - Store containing the reducer's current state.
 * @param {(action: Action) => void} state.dispatch - Existing action dispatcher.
 * @returns {UseReducer<T, Action>} React hook for subscribing to reducer state and dispatching actions.
 * - writeOnly `UseReducer<T, Action>['writeOnly']` - Hook exposing dispatch without subscribing to state.
 * - readOnly `UseReducer<T, Action>['readOnly']` - Reads the current snapshot without subscribing or exposing dispatch.
 * @example
 * ```tsx
 * import { counterReducerState } from './counterReducerState.js';
 *
 * const useCounter = bindReducer(counterReducerState);
 *
 * function Counter() {
 *   const [state] = useCounter();
 *   return <span>{state.count}</span>;
 * }
 * ```
 */
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>): UseReducer<T, Action>;
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>) {
  return createUseState<T, Action>(state.store, true, state.dispatch);
}

/**
 * @description Binds a structural readable store to a React subscription
 * hook without exposing writers.
 * @param {ReadableStore<T>} store - Readable store supplying snapshots and subscriptions.
 * @returns {UseReadonlyState<T>} React hook providing read-only access to the store snapshot.
 * - readOnly `UseReadonlyState<T>['readOnly']` - Reads the current snapshot without subscribing.
 * @example
 * ```tsx
 * import { temperatureStore } from './temperatureStore.js';
 *
 * const useTemperature = bindReadonly(temperatureStore);
 *
 * function Temperature() {
 *   const temperature = useTemperature();
 *   return <span>{temperature} °C</span>;
 * }
 * ```
 */
export function bindReadonly<T>(store: ReadableStore<T>): UseReadonlyState<T> {
  return createReadonlyState(store);
}

/**
 * @description Binds borrowed persistence status to a read-only React hook.
 * Hook cleanup unsubscribes from status updates but never disposes persistence.
 * @param {Pick<PersistControls, 'getStatus' | 'subscribe'>} persist - Persistence controls supplying status snapshots and subscriptions.
 * @param {(listener: (status: PersistStatus) => void) => () => void} persist.subscribe - Registers a status listener and returns its unsubscribe function.
 * @param {() => PersistStatus} persist.getStatus - Returns the current persistence status.
 * @returns {UseReadonlyState<PersistStatus>} React hook for subscribing to persistence status without exposing persistence controls.
 * - readOnly `UseReadonlyState<PersistStatus>['readOnly']` - Reads the current persistence status without subscribing.
 * @example
 * ```tsx
 * import { persistence } from './settingsPersistence.js';
 *
 * const usePersistenceStatus = bindPersistStatus(persistence);
 *
 * function PersistenceStatus() {
 *   const status = usePersistenceStatus();
 *   return <pre>{JSON.stringify(status)}</pre>;
 * }
 * ```
 */
export function bindPersistStatus(
  persist: Pick<PersistControls, 'getStatus' | 'subscribe'>,
): UseReadonlyState<PersistStatus> {
  return bindReadonly(createPersistStatusStore(persist));
}
