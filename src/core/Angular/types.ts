import type { Store } from '@ilokesto/store';
import type { DestroyRef, Signal } from '@angular/core';

import type { ReducerAction } from '../../types/ReduceFn.js';
import type { ReadonlySnapshot } from '../shared/readonlySnapshot.js';

export type Selector<T, S> = (state: ReadonlySnapshot<T>) => S;
export type SetStateAction<T> = Parameters<Store<T>['setState']>[0];
export type StateWriter<T> = (nextState: SetStateAction<T>) => void;
export type ActionWriter<Action> = (action: Action) => void;
export type AngularOptions = {
  destroyRef?: DestroyRef;
};

export type AngularStateResult<S, T> = Readonly<{
  state: Signal<S>;
  setState: StateWriter<T>;
  subscribe: Store<T>['subscribe'];
}>;

export type AngularReducerResult<S, T, Action> = Readonly<{
  state: Signal<S>;
  dispatch: ActionWriter<Action>;
  subscribe: Store<T>['subscribe'];
}>;

export type UseState<T> = {
  (): AngularStateResult<ReadonlySnapshot<T>, T>;
  (options: AngularOptions): AngularStateResult<ReadonlySnapshot<T>, T>;
  <S>(selector: Selector<T, S>, options?: AngularOptions): AngularStateResult<S, T>;
  writeOnly: () => StateWriter<T>;
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: Selector<T, S>): S;
  };
  subscribe: Store<T>['subscribe'];
};

export type UseReducer<T, Action extends ReducerAction> = {
  (): AngularReducerResult<ReadonlySnapshot<T>, T, Action>;
  (options: AngularOptions): AngularReducerResult<ReadonlySnapshot<T>, T, Action>;
  <S>(selector: Selector<T, S>, options?: AngularOptions): AngularReducerResult<S, T, Action>;
  writeOnly: () => ActionWriter<Action>;
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: Selector<T, S>): S;
  };
  subscribe: Store<T>['subscribe'];
};
