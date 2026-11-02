import type { EqualityFn, ReadableStore, StoreApi } from '@ilokesto/store';
import type { DestroyRef, Signal } from '@angular/core';

import type { ReducerAction } from '../../types/ReduceFn.js';
import type { ReadonlySnapshot } from '../shared/readonlySnapshot.js';

/** Selects a value from a readonly store snapshot. */
export type Selector<T, S> = (state: ReadonlySnapshot<T>) => S;
/** The state update accepted by the underlying store's setState method. */
export type SetStateAction<T> = Parameters<StoreApi<T>['setState']>[0];
/** Writes a state update to the underlying store. */
export type StateWriter<T> = (nextState: SetStateAction<T>) => void;
/** Dispatches an action to the underlying reducer. */
export type ActionWriter<Action> = (action: Action) => void;
/** Lifecycle options for an Angular store binding. */
export type AngularOptions = {
  /** Angular destruction scope used to clean up the binding's subscription. */
  destroyRef?: DestroyRef;
};

/** A reactive state selection with access to store updates and subscriptions. */
export type AngularStateResult<S, T> = Readonly<{
  /** Signal containing the selected state value. */
  state: Signal<S>;
  /** Updates the underlying store, not merely the selected value. */
  setState: StateWriter<T>;
  /** Subscribes directly to changes in the underlying store. */
  subscribe: StoreApi<T>['subscribe'];
}>;

/** A reactive state selection with reducer dispatch and store subscriptions. */
export type AngularReducerResult<S, T, Action> = Readonly<{
  /** Signal containing the selected state value. */
  state: Signal<S>;
  /** Dispatches an action to the underlying reducer. */
  dispatch: ActionWriter<Action>;
  /** Subscribes directly to changes in the underlying store. */
  subscribe: StoreApi<T>['subscribe'];
}>;

/** Creates an Angular signal binding for the full store or a selected value. */
export type UseState<T> = {
  /** Binds the full readonly state snapshot. */
  (): AngularStateResult<ReadonlySnapshot<T>, T>;
  /** Binds the full readonly state snapshot with explicit lifecycle options. */
  (options: AngularOptions): AngularStateResult<ReadonlySnapshot<T>, T>;
  /** Binds a selected value with optional lifecycle options. */
  <S>(selector: Selector<T, S>, options?: AngularOptions): AngularStateResult<S, T>;
  /** Binds a selected value with optional equality comparison and lifecycle options. */
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>, options?: AngularOptions): AngularStateResult<S, T>;
  /** Returns a state writer without creating a reactive state binding. */
  writeOnly: () => StateWriter<T>;
  /** Reads the current snapshot or a selection without creating a reactive binding. */
  readOnly: {
    /** Returns the current full readonly state snapshot. */
    (): ReadonlySnapshot<T>;
    /** Returns a value selected from the current readonly state snapshot. */
    <S>(selector: Selector<T, S>): S;
  };
  /** Subscribes directly to changes in the underlying store. */
  subscribe: StoreApi<T>['subscribe'];
};

/** Creates an Angular signal binding with access to reducer dispatch. */
export type UseReducer<T, Action extends ReducerAction> = {
  /** Binds the full readonly state snapshot. */
  (): AngularReducerResult<ReadonlySnapshot<T>, T, Action>;
  /** Binds the full readonly state snapshot with explicit lifecycle options. */
  (options: AngularOptions): AngularReducerResult<ReadonlySnapshot<T>, T, Action>;
  /** Binds a selected value with optional lifecycle options. */
  <S>(selector: Selector<T, S>, options?: AngularOptions): AngularReducerResult<S, T, Action>;
  /** Binds a selected value with optional equality comparison and lifecycle options. */
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>, options?: AngularOptions): AngularReducerResult<S, T, Action>;
  /** Returns an action dispatcher without creating a reactive state binding. */
  writeOnly: () => ActionWriter<Action>;
  /** Reads the current snapshot or a selection without creating a reactive binding. */
  readOnly: {
    /** Returns the current full readonly state snapshot. */
    (): ReadonlySnapshot<T>;
    /** Returns a value selected from the current readonly state snapshot. */
    <S>(selector: Selector<T, S>): S;
  };
  /** Subscribes directly to changes in the underlying store. */
  subscribe: StoreApi<T>['subscribe'];
};

/** Creates an Angular signal binding without exposing store mutation methods. */
export type UseReadonlyState<T> = {
  /** Binds the full readonly state snapshot with optional lifecycle options. */
  (options?: AngularOptions): Readonly<{ /** Signal containing the full readonly state snapshot. */ state: Signal<ReadonlySnapshot<T>>; /** Subscribes directly to changes in the underlying readable store. */ subscribe: ReadableStore<T>['subscribe'] }>;
  /** Binds a selected value with optional lifecycle options. */
  <S>(selector: Selector<T, S>, options?: AngularOptions): Readonly<{ /** Signal containing the selected state value. */ state: Signal<S>; /** Subscribes directly to changes in the underlying readable store. */ subscribe: ReadableStore<T>['subscribe'] }>;
  /** Binds a selected value with optional equality comparison and lifecycle options. */
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>, options?: AngularOptions): Readonly<{ /** Signal containing the selected state value. */ state: Signal<S>; /** Subscribes directly to changes in the underlying readable store. */ subscribe: ReadableStore<T>['subscribe'] }>;
  /** Reads the current snapshot or a selection without creating a reactive binding. */
  readOnly: UseState<T>['readOnly'];
  /** Subscribes directly to changes in the underlying readable store. */
  subscribe: ReadableStore<T>['subscribe'];
};
