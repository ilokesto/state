import type { EqualityFn, StoreApi } from '@ilokesto/store';
import type { Readable, Writable } from 'svelte/store';

import type { ReducerAction } from '../../types/ReduceFn.js';
import type { ReadonlySnapshot } from '../shared/readonlySnapshot.js';

export type Selector<T, S> = (state: ReadonlySnapshot<T>) => S;
export type SetStateAction<T> = Parameters<StoreApi<T>['setState']>[0];
export type StateWriter<T> = (nextState: SetStateAction<T>) => void;
export type ActionWriter<Action> = (action: Action) => void;

export type SvelteReadable<S> = Readable<S>;

export type SvelteStateStore<T> = Omit<Writable<T>, 'subscribe'> & Readable<ReadonlySnapshot<T>> & {
  /** Updates state using a value or updater accepted by the underlying store. */
  setState: StateWriter<T>;
  /** Creates a readable store for selected state, optionally comparing selections with a custom equality function. */
  select: <S>(selector: Selector<T, S>, equality?: EqualityFn<S>) => SvelteReadable<S>;
  /** Returns a state writer without exposing the store's read operations. */
  writeOnly: () => StateWriter<T>;
  /** Reads the current readonly state snapshot, or returns a selection from it, without subscribing. */
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: Selector<T, S>): S;
  };
};

export type SvelteReducerStore<T, Action extends ReducerAction> = Readable<ReadonlySnapshot<T>> & {
  /** Dispatches an action to update state through the reducer. */
  dispatch: ActionWriter<Action>;
  /** Creates a readable store for selected state, optionally comparing selections with a custom equality function. */
  select: <S>(selector: Selector<T, S>, equality?: EqualityFn<S>) => SvelteReadable<S>;
  /** Returns an action writer without exposing the store's read operations. */
  writeOnly: () => ActionWriter<Action>;
  /** Reads the current readonly state snapshot, or returns a selection from it, without subscribing. */
  readOnly: {
    (): ReadonlySnapshot<T>;
    <S>(selector: Selector<T, S>): S;
  };
};

export type UseState<T> = SvelteStateStore<T>;
export type UseReducer<T, Action extends ReducerAction> = SvelteReducerStore<T, Action>;

export type UseReadonlyState<T> = Readable<ReadonlySnapshot<T>> & {
  /** Creates a readable store for selected state, optionally comparing selections with a custom equality function. */
  select: <S>(selector: Selector<T, S>, equality?: EqualityFn<S>) => SvelteReadable<S>;
  /** Reads the current readonly state snapshot, or returns a selection from it, without subscribing. */
  readOnly: UseState<T>['readOnly'];
};
