import type { EqualityFn, StoreApi } from '@ilokesto/store';
import type { ComputedRef } from 'vue';

import type { ReducerAction } from '../../types/ReduceFn.js';
import type { ReadonlySnapshot } from '../shared/readonlySnapshot.js';

/** Selects a value from a readonly store snapshot. */
export type Selector<T, S> = (state: ReadonlySnapshot<T>) => S;
/** The update argument accepted by the underlying store's setState method. */
export type SetStateAction<T> = Parameters<StoreApi<T>['setState']>[0];
/** Updates the store using its supported state-update argument. */
export type StateWriter<T> = (nextState: SetStateAction<T>) => void;
/** Dispatches an action to the store's reducer. */
export type ActionWriter<Action> = (action: Action) => void;

/** Reactive state access paired with a store updater. */
export type VueStateResult<S, T> = Readonly<{
  /** Computed ref containing the full snapshot or the selected value. */
  state: ComputedRef<S>;
  /** Updates the underlying store, even when state contains a selected value. */
  setState: StateWriter<T>;
}>;

/** Reactive state access paired with a reducer action dispatcher. */
export type VueReducerResult<S, Action> = Readonly<{
  /** Computed ref containing the full snapshot or the selected value. */
  state: ComputedRef<S>;
  /** Dispatches an action to update the underlying store through its reducer. */
  dispatch: ActionWriter<Action>;
}>;

/** Vue state accessor with reactive, write-only, and snapshot-reading forms. */
export type UseState<T> = {
  /** Returns the full reactive snapshot and the store updater. */
  (): VueStateResult<ReadonlySnapshot<T>, T>;
  /** Returns a reactive selection and the store updater, with optional selection equality. */
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): VueStateResult<S, T>;
  /** Returns the store updater without requesting reactive state access. */
  writeOnly: () => StateWriter<T>;
  /** Reads the current snapshot or a selection directly, without a computed-ref wrapper. */
  readOnly: {
    /** Returns the current full readonly snapshot. */
    (): ReadonlySnapshot<T>;
    /** Returns a value selected from the current readonly snapshot. */
    <S>(selector: Selector<T, S>): S;
  };
};

/** Vue reducer accessor with reactive, dispatch-only, and snapshot-reading forms. */
export type UseReducer<T, Action extends ReducerAction> = {
  /** Returns the full reactive snapshot and the action dispatcher. */
  (): VueReducerResult<ReadonlySnapshot<T>, Action>;
  /** Returns a reactive selection and the action dispatcher, with optional selection equality. */
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): VueReducerResult<S, Action>;
  /** Returns the action dispatcher without requesting reactive state access. */
  writeOnly: () => ActionWriter<Action>;
  /** Reads the current snapshot or a selection directly, without a computed-ref wrapper. */
  readOnly: {
    /** Returns the current full readonly snapshot. */
    (): ReadonlySnapshot<T>;
    /** Returns a value selected from the current readonly snapshot. */
    <S>(selector: Selector<T, S>): S;
  };
};

/** Vue state accessor that exposes reactive reads without a state updater. */
export type UseReadonlyState<T> = {
  /** Returns the full readonly snapshot in a computed ref. */
  (): Readonly<{
    /** Computed ref containing the full readonly store snapshot. */
    state: ComputedRef<ReadonlySnapshot<T>>
  }>;
  /** Returns a reactive selection, with optional selection equality. */
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): Readonly<{
    /** Computed ref containing the value produced by the selector. */
    state: ComputedRef<S>
  }>;
  /** Reads the current snapshot or a selection directly, without a computed-ref wrapper. */
  readOnly: UseState<T>['readOnly'];
};
