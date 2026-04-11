import { Store } from '@ilokesto/store';

import { getStore } from '../../lib/getStore';
import type { ReduceFn } from '../../types/ReduceFn';
import type { UseReducer, UseState } from './types';
export type { AngularOptions, UseReducer, UseState } from './types';

import { getInitialState } from '../shared/getInitialState';
import { createUseSignal } from './createUseSignal';

export function create<T, Action extends { type: string; [x: PropertyKey]: unknown }>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

export function create<T>(initialState: T | Store<T>): UseState<T>;

export function create<T, Action extends { type: string; [x: PropertyKey]: unknown }>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
) {
  const { initialState, isReduce } = getInitialState(firstArg, secondArg);
  const store = getStore(initialState, isReduce ? (firstArg as ReduceFn<T, Action>) : undefined);

  return createUseSignal<T, Action>(store, isReduce);
}
