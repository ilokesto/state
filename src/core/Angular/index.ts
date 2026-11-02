import type { Store, StoreApi, ReadableStore } from '@ilokesto/store';
import type { ReducerState } from '../../lib/createReducer.js';

import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import type { UseReadonlyState, UseReducer, UseState } from './types.js';
export type { AngularOptions, UseReadonlyState, UseReducer, UseState } from './types.js';
export { bindResource } from './bindResource.js';
export type { UseResource } from './bindResource.js';

import { createFrameworkAdapter } from '../shared/createFrameworkAdapter.js';
import { createPersistStatusStore } from '../shared/createPersistStatusStore.js';
import type { PersistControls, PersistStatus } from '../../middleware/persist/Persist.js';
import { createReadonlySignal, createUseSignal } from './createUseSignal.js';

/**
 * @description Creates an Angular signal binding from plain state, an existing
 * store, or a reducer and its initial state.
 *
 * Returns a function that must be called inside an injection context or with
 * an explicit `{ destroyRef }`. Without a selector, `state` is a `Signal` of a
 * read-only snapshot: object state is `Readonly<T>`, while callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 *
 * @param {ReduceFn<T, Action>} reduceFn - Reducer used by the two-argument overload
 * to compute state from dispatched actions.
 * @param {T | Store<T>} initialState - Initial value or existing store; supplied
 * alone for state binding or after the reducer for reducer binding.
 * @returns {UseReducer<T, Action> | UseState<T>} Callable Angular binding with
 * reducer dispatch when a reducer is supplied, or state-writing access otherwise.
 * - writeOnly `UseReducer<T, Action>['writeOnly'] | UseState<T>['writeOnly']` - Write-only access to reducer dispatch or state updates, respectively.
 * - readOnly `UseReducer<T, Action>['readOnly'] | UseState<T>['readOnly']` - Synchronous read-only snapshot access using the same snapshot semantics as the main binding.
 * - subscribe `UseReducer<T, Action>['subscribe'] | UseState<T>['subscribe']` - Subscription access to state changes.
 * @example
 * ```ts
 * const useCount = create(0);
 * const useReducedCount = create(
 *   (count: number, action: { type: 'increment' }) =>
 *     action.type === 'increment' ? count + 1 : count,
 *   0,
 * );
 * ```
 */
export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

/**
 * @description Creates an Angular signal binding from plain state, an existing
 * store, or a reducer and its initial state.
 *
 * Returns a function that must be called inside an injection context or with
 * an explicit `{ destroyRef }`. Without a selector, `state` is a `Signal` of a
 * read-only snapshot: object state is `Readonly<T>`, while callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 *
 * @param {ReduceFn<T, Action>} reduceFn - Reducer used by the two-argument overload
 * to compute state from dispatched actions.
 * @param {T | Store<T>} initialState - Initial value or existing store; supplied
 * alone for state binding or after the reducer for reducer binding.
 * @returns {UseReducer<T, Action> | UseState<T>} Callable Angular binding with
 * reducer dispatch when a reducer is supplied, or state-writing access otherwise.
 * - writeOnly `UseReducer<T, Action>['writeOnly'] | UseState<T>['writeOnly']` - Write-only access to reducer dispatch or state updates, respectively.
 * - readOnly `UseReducer<T, Action>['readOnly'] | UseState<T>['readOnly']` - Synchronous read-only snapshot access using the same snapshot semantics as the main binding.
 * - subscribe `UseReducer<T, Action>['subscribe'] | UseState<T>['subscribe']` - Subscription access to state changes.
 * @example
 * ```ts
 * const useCount = create(0);
 * const useReducedCount = create(
 *   (count: number, action: { type: 'increment' }) =>
 *     action.type === 'increment' ? count + 1 : count,
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
    createUseSignal<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}

/**
 * @description Binds an existing structural store without recreating or
 * inspecting its value. Invoke the returned signal binding inside an injection
 * context or with an explicit `{ destroyRef }`.
 * @param {StoreApi<T>} store - Existing store supplying state reads, writes,
 * and subscriptions.
 * @returns {UseState<T>} Callable Angular state binding backed by the supplied store.
 * - writeOnly `UseState<T>['writeOnly']` - Write-only access to state updates.
 * - readOnly `UseState<T>['readOnly']` - Synchronous read-only snapshot access.
 * - subscribe `UseState<T>['subscribe']` - Subscription access to state changes.
 * @example
 * ```ts
 * function bindCounter(store: StoreApi<number>) {
 *   return bind(store);
 * }
 * ```
 */
export function bind<T>(store: StoreApi<T>): UseState<T>;
export function bind<T>(store: StoreApi<T>) {
  return createUseSignal<T, never>(store, false);
}

/**
 * @description Binds an explicit reducer handle without registering the reducer
 * again. Reads use its store and writes use its existing dispatch function.
 * Invoke the returned signal binding inside an injection context or with an
 * explicit `{ destroyRef }`.
 * @param {ReducerState<T, Action>} state - Existing reducer handle to bind.
 * @param {StoreApi<T>} state.store - Store containing the reducer's current state.
 * @param {(action: Action) => void} state.dispatch - Existing action dispatcher
 * used for reducer writes.
 * @returns {UseReducer<T, Action>} Callable Angular binding for the existing reducer.
 * - writeOnly `UseReducer<T, Action>['writeOnly']` - Write-only access to the supplied action dispatcher.
 * - readOnly `UseReducer<T, Action>['readOnly']` - Synchronous read-only snapshot access to reducer state.
 * - subscribe `UseReducer<T, Action>['subscribe']` - Subscription access to reducer state changes.
 * @example
 * ```ts
 * function bindCounter(
 *   state: ReducerState<number, { type: 'increment' }>,
 * ) {
 *   return bindReducer(state);
 * }
 * ```
 */
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>): UseReducer<T, Action>;
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>) {
  return createUseSignal<T, Action>(state.store, true, state.dispatch);
}

/**
 * @description Binds a structural readable store without exposing writers.
 * Invoke the returned signal binding inside an injection context or with an
 * explicit `{ destroyRef }`.
 * @param {ReadableStore<T>} store - Readable store supplying snapshots and
 * change notifications.
 * @returns {UseReadonlyState<T>} Callable Angular binding with read-only access.
 * - readOnly `UseReadonlyState<T>['readOnly']` - Synchronous read-only snapshot access.
 * - subscribe `UseReadonlyState<T>['subscribe']` - Subscription access to state changes.
 * @example
 * ```ts
 * function bindCounterView(store: ReadableStore<number>) {
 *   return bindReadonly(store);
 * }
 * ```
 */
export function bindReadonly<T>(store: ReadableStore<T>): UseReadonlyState<T> {
  return createReadonlySignal(store);
}

/**
 * @description Binds borrowed persistence status as read-only Angular state.
 * DestroyRef cleanup never disposes persistence. Invoke the returned signal
 * binding inside an injection context or with an explicit `{ destroyRef }`.
 * @param {Pick<PersistControls, 'getStatus' | 'subscribe'>} persist - Borrowed
 * persistence controls supplying the current status and change notifications.
 * @param {(listener: (status: PersistStatus) => void) => () => void} persist.subscribe -
 * Registers a status listener and returns a function that removes it.
 * @param {() => PersistStatus} persist.getStatus - Returns the current persistence status.
 * @returns {UseReadonlyState<PersistStatus>} Callable read-only Angular binding
 * for persistence status.
 * - readOnly `UseReadonlyState<PersistStatus>['readOnly']` - Synchronous read-only snapshot access to persistence status.
 * - subscribe `UseReadonlyState<PersistStatus>['subscribe']` - Subscription access to persistence status changes.
 * @example
 * ```ts
 * function bindPersistenceIndicator(persist: PersistControls) {
 *   return bindPersistStatus(persist);
 * }
 * ```
 */
export function bindPersistStatus(
  persist: Pick<PersistControls, 'getStatus' | 'subscribe'>,
): UseReadonlyState<PersistStatus> {
  return bindReadonly(createPersistStatusStore(persist));
}
