import type { EqualityFn, StoreApi } from '@ilokesto/store';
import type { ComputedRef } from 'vue';

import type { ReducerAction } from '../../types/ReduceFn.js';
import type { ReadonlySnapshot } from '../shared/readonlySnapshot.js';

export type Selector<T, S> = (state: ReadonlySnapshot<T>) => S;
export type SetStateAction<T> = Parameters<StoreApi<T>['setState']>[0];
export type StateWriter<T> = (nextState: SetStateAction<T>) => void;
export type ActionWriter<Action> = (action: Action) => void;

export type VueStateResult<S, T> = Readonly<{
  state: ComputedRef<S>;
  setState: StateWriter<T>;
}>;

export type VueReducerResult<S, Action> = Readonly<{
  state: ComputedRef<S>;
  dispatch: ActionWriter<Action>;
}>;

export type UseState<T> = {
  (): VueStateResult<ReadonlySnapshot<T>, T>;
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): VueStateResult<S, T>;
  writeOnly: () => StateWriter<T>;
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: Selector<T, S>): S;
  };
};

export type UseReducer<T, Action extends ReducerAction> = {
  (): VueReducerResult<ReadonlySnapshot<T>, Action>;
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): VueReducerResult<S, Action>;
  writeOnly: () => ActionWriter<Action>;
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: Selector<T, S>): S;
  };
};

export type UseReadonlyState<T> = {
  (): Readonly<{ state: ComputedRef<ReadonlySnapshot<T>> }>;
  <S>(selector: Selector<T, S>, equality?: EqualityFn<S>): Readonly<{ state: ComputedRef<S> }>;
  readOnly: UseState<T>['readOnly'];
};
