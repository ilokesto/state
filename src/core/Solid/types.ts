import type { EqualityFn, StoreApi } from '@ilokesto/store';
import type { Accessor } from 'solid-js';

import type { ReducerAction } from '../../types/ReduceFn.js';
import type { ReadonlySnapshot } from '../shared/readonlySnapshot.js';

export type Selector<T, S> = (state: ReadonlySnapshot<T>) => S;
export type SetStateAction<T> = Parameters<StoreApi<T>['setState']>[0];
export type StateWriter<T> = (nextState: SetStateAction<T>) => void;
export type ActionWriter<Action> = (action: Action) => void;

export type SolidStateResult<S, T> = Readonly<{
  /** Reactive accessor for the current snapshot or selected value. */
  state: Accessor<S>;
  /** Updates the underlying store using its supported state-update actions. */
  setState: StateWriter<T>;
}>;

export type SolidReducerResult<S, Action> = Readonly<{
  /** Reactive accessor for the current snapshot or selected value. */
  state: Accessor<S>;
  /** Sends an action to the store's reducer. */
  dispatch: ActionWriter<Action>;
}>;

export type UseState<T> = {
  (): SolidStateResult<ReadonlySnapshot<T>, T>;
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): SolidStateResult<S, T>;
  /** Returns a state writer without exposing a reactive state accessor. */
  writeOnly: () => StateWriter<T>;
  /** Reads the current readonly snapshot, or a selected value, without exposing a writer. */
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: Selector<T, S>): S;
  };
};

export type UseReducer<T, Action extends ReducerAction> = {
  (): SolidReducerResult<ReadonlySnapshot<T>, Action>;
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): SolidReducerResult<S, Action>;
  /** Returns an action dispatcher without exposing a reactive state accessor. */
  writeOnly: () => ActionWriter<Action>;
  /** Reads the current readonly snapshot, or a selected value, without exposing a dispatcher. */
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: Selector<T, S>): S;
  };
};

export type UseReadonlyState<T> = {
  (): Readonly<{
    /** Reactive accessor for the current readonly store snapshot. */
    state: Accessor<ReadonlySnapshot<T>>
  }>;
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): Readonly<{
    /** Reactive accessor for the value produced by the selector. */
    state: Accessor<S>
  }>;
  /** Reads the current readonly snapshot, or a selected value, without exposing a writer. */
  readOnly: UseState<T>['readOnly'];
};
