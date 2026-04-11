import type { Store } from '@ilokesto/store';
import type { Accessor } from 'solid-js';

export type Selector<T, S> = (state: T) => S;
export type SetStateAction<T> = Parameters<Store<T>['setState']>[0];
export type StateWriter<T> = (nextState: SetStateAction<T>) => void;
export type ActionWriter<Action> = (action: Action) => void;

export type SolidStateResult<S, T> = Readonly<{
  state: Accessor<S>;
  setState: StateWriter<T>;
}>;

export type SolidReducerResult<S, Action> = Readonly<{
  state: Accessor<S>;
  dispatch: ActionWriter<Action>;
}>;

export type UseState<T> = {
  (): SolidStateResult<T, T>;
  <S>(selector: Selector<T, S>): SolidStateResult<S, T>;
  writeOnly: () => StateWriter<T>;
  readOnly: {
    (): T;
    <S>(selector: Selector<T, S>): S;
  };
};

export type UseReducer<T, Action extends object> = {
  (): SolidReducerResult<T, Action>;
  <S>(selector: Selector<T, S>): SolidReducerResult<S, Action>;
  writeOnly: () => ActionWriter<Action>;
  readOnly: {
    (): T;
    <S>(selector: Selector<T, S>): S;
  };
};
