import { SetStateAction } from 'react';

export type UseState<T> = {
  (): readonly [T, (nextState: SetStateAction<T>) => void];
  <S>(selector: (state: T) => S): readonly [S, (nextState: SetStateAction<T>) => void];
  writeOnly: () => (nextState: SetStateAction<T>) => void;
  readOnly: {
    (): T;
    <S>(selector: (state: T) => S): S;
  };
};

export type UseReducer<T, Action extends object> = {
  (): readonly [T, (action: Action) => void];
  <S>(selector: (state: T) => S): readonly [S, (action: Action) => void];
  writeOnly: () => (action: Action) => void;
  readOnly: {
    (): T;
    <S>(selector: (state: T) => S): S;
  };
};
