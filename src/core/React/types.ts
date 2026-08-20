import { SetStateAction } from 'react';

import type { ReducerAction } from '../../types/ReduceFn.js';

/**
 * React hook returned by `create()` for plain state.
 */
export type UseState<T> = {
  (): readonly [T, (nextState: SetStateAction<T>) => void];
  <S>(selector: (state: T) => S): readonly [S, (nextState: SetStateAction<T>) => void];
  writeOnly: () => (nextState: SetStateAction<T>) => void;
  readOnly: {
    (): T;
    <S>(selector: (state: T) => S): S;
  };
};

/**
 * React hook returned by `create()` for reducer state.
 */
export type UseReducer<T, Action extends ReducerAction> = {
  (): readonly [T, (action: Action) => void];
  <S>(selector: (state: T) => S): readonly [S, (action: Action) => void];
  writeOnly: () => (action: Action) => void;
  readOnly: {
    (): T;
    <S>(selector: (state: T) => S): S;
  };
};
