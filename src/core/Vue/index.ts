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
import { createReadonlyComposable, createUseComposable } from './createUseComposable.js';

/**
 * @description Creates a Vue composable from initial state or an existing store,
 * optionally using a reducer supplied as the first argument. Call the returned
 * composable inside setup() or an active effectScope(). Without a selector,
 * state is a ComputedRef of a read-only snapshot: object state is Readonly<T>,
 * while callable state retains its exact type and own-property modifiers.
 * Selectors and readOnly use the same snapshot.
 * @param {ReduceFn<T, Action>} reduceFn - Reducer used by the two-argument overload to process dispatched actions.
 * @param {T | Store<T>} initialState - Initial value or existing store; the sole argument for plain state, or the second argument with a reducer.
 * @returns {UseReducer<T, Action> | UseState<T>} A reducer composable for the two-argument overload, or a state composable for the one-argument overload.
 * - writeOnly `UseReducer<T, Action>['writeOnly'] | UseState<T>['writeOnly']` - Accesses dispatch or state writers without subscribing to state updates.
 * - readOnly `UseReducer<T, Action>['readOnly'] | UseState<T>['readOnly']` - Reads the snapshot, optionally through a selector, without exposing writers.
 * @example
 * ```ts
 * import { effectScope } from 'vue';
 * const useCount = create(0);
 * const useTotal = create((state: number, action: { type: 'increment' }) => state + 1, 0);
 * const scope = effectScope();
 * scope.run(() => {
 *   const count = useCount();
 *   const total = useTotal();
 * });
 * scope.stop();
 * ```
 */
export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

/**
 * @description Creates a Vue composable from initial state or an existing store,
 * optionally using a reducer supplied as the first argument. Call the returned
 * composable inside setup() or an active effectScope(). Without a selector,
 * state is a ComputedRef of a read-only snapshot: object state is Readonly<T>,
 * while callable state retains its exact type and own-property modifiers.
 * Selectors and readOnly use the same snapshot.
 * @param {ReduceFn<T, Action>} reduceFn - Reducer used by the two-argument overload to process dispatched actions.
 * @param {T | Store<T>} initialState - Initial value or existing store; the sole argument for plain state, or the second argument with a reducer.
 * @returns {UseReducer<T, Action> | UseState<T>} A reducer composable for the two-argument overload, or a state composable for the one-argument overload.
 * - writeOnly `UseReducer<T, Action>['writeOnly'] | UseState<T>['writeOnly']` - Accesses dispatch or state writers without subscribing to state updates.
 * - readOnly `UseReducer<T, Action>['readOnly'] | UseState<T>['readOnly']` - Reads the snapshot, optionally through a selector, without exposing writers.
 * @example
 * ```ts
 * import { effectScope } from 'vue';
 * const useCount = create(0);
 * const useTotal = create((state: number, action: { type: 'increment' }) => state + 1, 0);
 * const scope = effectScope();
 * scope.run(() => {
 *   const count = useCount();
 *   const total = useTotal();
 * });
 * scope.stop();
 * ```
 */
export function create<T>(initialState: T | Store<T>): UseState<T>;

export function create<T, Action extends ReducerAction>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
) {
  return createFrameworkAdapter(
    createUseComposable<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}

/**
 * @description Binds an existing structural store without recreating it or inspecting its value. Call the composable inside setup() or an active effectScope().
 * @param {StoreApi<T>} store - Existing store providing state subscriptions and writers.
 * @returns {UseState<T>} A Vue state composable backed by the supplied store.
 * - writeOnly `UseState<T>['writeOnly']` - Accesses state writers without subscribing to state updates.
 * - readOnly `UseState<T>['readOnly']` - Reads a read-only snapshot, optionally through a selector, without exposing writers.
 * @example
 * ```ts
 * import { effectScope } from 'vue';
 * const useCount = bind(countStore);
 * const scope = effectScope();
 * scope.run(() => { const count = useCount(); });
 * scope.stop();
 * ```
 */
export function bind<T>(store: StoreApi<T>): UseState<T>;
export function bind<T>(store: StoreApi<T>) {
  return createUseComposable<T, never>(store, false);
}

/**
 * @description Binds an explicit reducer handle without registering its reducer again. Call the composable inside setup() or an active effectScope().
 * @param {ReducerState<T, Action>} state - Existing reducer handle to bind.
 * @param {StoreApi<T>} state.store - Store containing the reducer's current state.
 * @param {(action: Action) => void} state.dispatch - Existing dispatcher used to process actions.
 * @returns {UseReducer<T, Action>} A Vue reducer composable using the supplied store and dispatcher.
 * - writeOnly `UseReducer<T, Action>['writeOnly']` - Accesses dispatch without subscribing to state updates.
 * - readOnly `UseReducer<T, Action>['readOnly']` - Reads a read-only snapshot, optionally through a selector, without exposing dispatch.
 * @example
 * ```ts
 * import { effectScope } from 'vue';
 * const useCounter = bindReducer(counterReducer);
 * const scope = effectScope();
 * scope.run(() => { const counter = useCounter(); });
 * scope.stop();
 * ```
 */
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>): UseReducer<T, Action>;
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>) {
  return createUseComposable<T, Action>(state.store, true, state.dispatch);
}

/**
 * @description Binds a structural readable store without exposing writers. Call the composable inside setup() or an active effectScope().
 * @param {ReadableStore<T>} store - Store providing readable state and subscriptions.
 * @returns {UseReadonlyState<T>} A Vue composable for reading the supplied store without writers.
 * - readOnly `UseReadonlyState<T>['readOnly']` - Reads a read-only snapshot, optionally through a selector.
 * @example
 * ```ts
 * import { effectScope } from 'vue';
 * const useSettings = bindReadonly(settingsStore);
 * const scope = effectScope();
 * scope.run(() => { const settings = useSettings(); });
 * scope.stop();
 * ```
 */
export function bindReadonly<T>(store: ReadableStore<T>): UseReadonlyState<T> {
  return createReadonlyComposable(store);
}

/**
 * @description Binds borrowed persistence status as a read-only Vue composable. Call it inside setup() or an active effectScope(); scope cleanup releases subscriptions but never disposes persistence.
 * @param {Pick<PersistControls, 'getStatus' | 'subscribe'>} persist - Borrowed persistence status controls.
 * @param {(listener: (status: PersistStatus) => void) => () => void} persist.subscribe - Registers a status listener and returns its unsubscribe function.
 * @param {() => PersistStatus} persist.getStatus - Reads the current persistence status.
 * @returns {UseReadonlyState<PersistStatus>} A composable exposing persistence status without writers.
 * - readOnly `UseReadonlyState<PersistStatus>['readOnly']` - Reads the current status snapshot, optionally through a selector.
 * @example
 * ```ts
 * import { effectScope } from 'vue';
 * const useStatus = bindPersistStatus(persist);
 * const scope = effectScope();
 * scope.run(() => { const status = useStatus(); });
 * scope.stop(); // Persistence remains owned by the caller.
 * ```
 */
export function bindPersistStatus(
  persist: Pick<PersistControls, 'getStatus' | 'subscribe'>,
): UseReadonlyState<PersistStatus> {
  return bindReadonly(createPersistStatusStore(persist));
}
