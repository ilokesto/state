import type { EqualityFn, StoreApi } from '@ilokesto/store';
import type { Accessor } from 'solid-js';

import type { ReducerAction } from '../../types/ReduceFn.js';
import type { ReadonlySnapshot } from '../shared/readonlySnapshot.js';

export type Selector<T, S> = (state: ReadonlySnapshot<T>) => S;
export type SetStateAction<T> = Parameters<StoreApi<T>['setState']>[0];
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
  (): SolidStateResult<ReadonlySnapshot<T>, T>;
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): SolidStateResult<S, T>;
  writeOnly: () => StateWriter<T>;
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: Selector<T, S>): S;
  };
};

export type UseReducer<T, Action extends ReducerAction> = {
  (): SolidReducerResult<ReadonlySnapshot<T>, Action>;
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): SolidReducerResult<S, Action>;
  writeOnly: () => ActionWriter<Action>;
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: Selector<T, S>): S;
  };
};

export type UseReadonlyState<T> = {
  (): Readonly<{ state: Accessor<ReadonlySnapshot<T>> }>;
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): Readonly<{ state: Accessor<S> }>;
  readOnly: UseState<T>['readOnly'];
};
