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
import { createReadonlyStore, createStore } from './createStore.js';

/**
 * @description Creates a Svelte state adapter from plain state or an existing
 * store. With two arguments, registers the reducer and exposes dispatch instead
 * of direct state writes. Full-store subscriptions, selectors, and read-only
 * views receive snapshots: object state is Readonly<T>, while callable state
 * remains exact T, including its declared own-property modifiers.
 * @param {ReduceFn<T, Action>} reduceFn - Reducer used by the two-argument overload to compute state from actions.
 * @param {T | Store<T>} initialState - Initial state value or existing store for either overload.
 * @returns {UseReducer<T, Action> | UseState<T>} A reducer adapter for two arguments, or a writable state adapter for one argument.
 * - dispatch `UseReducer<T, Action>['dispatch']` - Dispatches actions through the reducer; available on the reducer adapter.
 * - setState `UseState<T>['setState']` - Writes state directly; available on the plain-state adapter.
 * - select `UseState<T>['select']` - Creates a selected view of state snapshots.
 * - writeOnly `UseState<T>['writeOnly'] | UseReducer<T, Action>['writeOnly']` - Provides the adapter's state-writing or action-dispatching capability without reading state.
 * - readOnly `UseState<T>['readOnly']` - Provides a read-only view of state snapshots.
 * @example
 * ```ts
 * const counter = create(0);
 * const reducerCounter = create(
 *   (state: number, action: { type: 'increment' }) => state + 1,
 *   0,
 * );
 * ```
 */
export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

/**
 * @description Creates a Svelte state adapter from plain state or an existing
 * store. With two arguments, registers the reducer and exposes dispatch instead
 * of direct state writes. Full-store subscriptions, selectors, and read-only
 * views receive snapshots: object state is Readonly<T>, while callable state
 * remains exact T, including its declared own-property modifiers.
 * @param {ReduceFn<T, Action>} reduceFn - Reducer used by the two-argument overload to compute state from actions.
 * @param {T | Store<T>} initialState - Initial state value or existing store for either overload.
 * @returns {UseReducer<T, Action> | UseState<T>} A reducer adapter for two arguments, or a writable state adapter for one argument.
 * - dispatch `UseReducer<T, Action>['dispatch']` - Dispatches actions through the reducer; available on the reducer adapter.
 * - setState `UseState<T>['setState']` - Writes state directly; available on the plain-state adapter.
 * - select `UseState<T>['select']` - Creates a selected view of state snapshots.
 * - writeOnly `UseState<T>['writeOnly'] | UseReducer<T, Action>['writeOnly']` - Provides the adapter's state-writing or action-dispatching capability without reading state.
 * - readOnly `UseState<T>['readOnly']` - Provides a read-only view of state snapshots.
 * @example
 * ```ts
 * const counter = create(0);
 * const reducerCounter = create(
 *   (state: number, action: { type: 'increment' }) => state + 1,
 *   0,
 * );
 * ```
 */
export function create<T>(initialState: T | Store<T>): UseState<T>;

export function create<T, Action extends ReducerAction>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
) {
  return createFrameworkAdapter(
    createStore<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}

/**
 * @description Binds an existing structural store to a Svelte state adapter
 * without recreating the store or inspecting its value.
 * @param {StoreApi<T>} store - Existing readable and writable store to adapt.
 * @returns {UseState<T>} A writable adapter backed by the supplied store.
 * - setState `UseState<T>['setState']` - Writes state to the underlying store.
 * - select `UseState<T>['select']` - Creates a selected view of state snapshots.
 * - writeOnly `UseState<T>['writeOnly']` - Provides state-writing capability without reading state.
 * - readOnly `UseState<T>['readOnly']` - Provides a read-only view of state snapshots.
 * @example
 * ```ts
 * import { createStore } from '@ilokesto/store';
 * const store = createStore(0);
 * const counter = bind(store);
 * ```
 */
export function bind<T>(store: StoreApi<T>): UseState<T>;
export function bind<T>(store: StoreApi<T>) {
  return createStore<T, never>(store, false);
}

/**
 * @description Binds an explicit reducer handle to a Svelte adapter without
 * registering the reducer again. Actions use the supplied dispatch function.
 * @param {ReducerState<T, Action>} state - Existing reducer handle to adapt.
 * @param {StoreApi<T>} state.store - Store holding the reducer's state.
 * @param {(action: Action) => void} state.dispatch - Existing action dispatcher.
 * @returns {UseReducer<T, Action>} A reducer adapter backed by the supplied handle.
 * - dispatch `UseReducer<T, Action>['dispatch']` - Dispatches actions through the supplied dispatcher.
 * - select `UseReducer<T, Action>['select']` - Creates a selected view of state snapshots.
 * - writeOnly `UseReducer<T, Action>['writeOnly']` - Provides action-dispatching capability without reading state.
 * - readOnly `UseReducer<T, Action>['readOnly']` - Provides a read-only view of state snapshots.
 * @example
 * ```ts
 * import { createStore } from '@ilokesto/store';
 * const store = createStore(0);
 * const dispatch = (action: { type: 'reset' }) => store.setState(0);
 * const counter = bindReducer({ store, dispatch });
 * ```
 */
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>): UseReducer<T, Action>;
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>) {
  return createStore<T, Action>(state.store, true, state.dispatch);
}

/**
 * @description Binds a structural readable store to a Svelte adapter without
 * exposing state writers.
 * @param {ReadableStore<T>} store - Existing readable store to adapt.
 * @returns {UseReadonlyState<T>} A read-only adapter backed by the supplied store.
 * - select `UseReadonlyState<T>['select']` - Creates a selected view of state snapshots.
 * - readOnly `UseReadonlyState<T>['readOnly']` - Provides a read-only view of state snapshots.
 * @example
 * ```ts
 * import { createStore } from '@ilokesto/store';
 * const store = createStore(0);
 * const counter = bindReadonly(store);
 * ```
 */
export function bindReadonly<T>(store: ReadableStore<T>): UseReadonlyState<T> {
  return createReadonlyStore(store);
}

/**
 * @description Adapts borrowed persistence status to a read-only Svelte state
 * adapter. Unsubscribing releases the status subscription but never disposes
 * the underlying persistence controls.
 * @param {Pick<PersistControls, 'getStatus' | 'subscribe'>} persist - Persistence controls whose status is observed.
 * @param {(listener: (status: PersistStatus) => void) => () => void} persist.subscribe - Registers a status listener and returns its unsubscribe function.
 * @param {() => PersistStatus} persist.getStatus - Reads the current persistence status.
 * @returns {UseReadonlyState<PersistStatus>} A read-only adapter for persistence status.
 * - select `UseReadonlyState<PersistStatus>['select']` - Creates a selected view of persistence status.
 * - readOnly `UseReadonlyState<PersistStatus>['readOnly']` - Provides a read-only view of persistence status.
 * @example
 * ```ts
 * function observePersistence(persist: Pick<PersistControls, 'getStatus' | 'subscribe'>) {
 *   return bindPersistStatus(persist);
 * }
 * ```
 */
export function bindPersistStatus(
  persist: Pick<PersistControls, 'getStatus' | 'subscribe'>,
): UseReadonlyState<PersistStatus> {
  return bindReadonly(createPersistStatusStore(persist));
}
