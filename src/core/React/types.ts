import type { EqualityFn } from '@ilokesto/store';
import { SetStateAction } from 'react';

import type { ReducerAction } from '../../types/ReduceFn.js';
import type { ReadonlySnapshot } from '../shared/readonlySnapshot.js';

/**
 * React hook returned by `create()` for plain state.
 */
export type UseState<T> = {
  (): readonly [ReadonlySnapshot<T>, (nextState: SetStateAction<T>) => void];
  <S>(selector: (state: ReadonlySnapshot<T>) => S, equality?: EqualityFn<S>): readonly [S, (nextState: SetStateAction<T>) => void];
  /** Returns the state setter without subscribing the component to state changes. */
  writeOnly: () => (nextState: SetStateAction<T>) => void;
  /** Reads the full snapshot or a selected value without exposing the setter. */
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: (state: ReadonlySnapshot<T>) => S): S;
  };
};

/**
 * React hook returned by `create()` for reducer state.
 */
export type UseReducer<T, Action extends ReducerAction> = {
  (): readonly [ReadonlySnapshot<T>, (action: Action) => void];
  <S>(selector: (state: ReadonlySnapshot<T>) => S, equality?: EqualityFn<S>): readonly [S, (action: Action) => void];
  /** Returns the action dispatcher without subscribing the component to state changes. */
  writeOnly: () => (action: Action) => void;
  /** Reads the full snapshot or a selected value without exposing the dispatcher. */
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: (state: ReadonlySnapshot<T>) => S): S;
  };
};

/**
 * React hook for reading the full state snapshot or a selected value,
 * with an optional equality function for selected values.
 */
export type UseReadonlyState<T> = {
  (): ReadonlySnapshot<T>;
  <S>(selector: (state: ReadonlySnapshot<T>) => S, equality?: EqualityFn<S>): S;
  /** Reads the full snapshot or a selected value without exposing a state setter. */
  readOnly: UseState<T>['readOnly'];
};
