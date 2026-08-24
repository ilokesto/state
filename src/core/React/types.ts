import { SetStateAction } from 'react';

import type { ReducerAction } from '../../types/ReduceFn.js';
import type { ReadonlySnapshot } from '../shared/readonlySnapshot.js';

/**
 * React hook returned by `create()` for plain state.
 */
export type UseState<T> = {
  (): readonly [ReadonlySnapshot<T>, (nextState: SetStateAction<T>) => void];
  <S>(selector: (state: ReadonlySnapshot<T>) => S): readonly [S, (nextState: SetStateAction<T>) => void];
  writeOnly: () => (nextState: SetStateAction<T>) => void;
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
  <S>(selector: (state: ReadonlySnapshot<T>) => S): readonly [S, (action: Action) => void];
  writeOnly: () => (action: Action) => void;
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: (state: ReadonlySnapshot<T>) => S): S;
  };
};
