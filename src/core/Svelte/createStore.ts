import type { EqualityFn, ReadableStore, StoreApi } from '@ilokesto/store';

import type { Readable, Subscriber, Unsubscriber, Updater } from 'svelte/store';

import type { ReducerAction } from '../../types/ReduceFn.js';
import { createDispatch } from '../shared/createDispatch.js';
import { identity } from '../shared/identity.js';
import { readonlySnapshot, type ReadonlySnapshot } from '../shared/readonlySnapshot.js';
import { shallow } from '../shared/shallow.js';
import type { Selector, UseReadonlyState, UseReducer, UseState } from './types.js';

function createReadable<T, S>(store: ReadableStore<T>, selector: Selector<T, S>, equality: EqualityFn<S> = shallow): Readable<S> {
  return {
    subscribe(run: Subscriber<S>): Unsubscriber {
      const initialSelection = selector(readonlySnapshot(store.getState()));
      const unsubscribe = store.subscribeSelector(
        (state) => selector(readonlySnapshot(state)),
        run,
        equality,
      );

      run(initialSelection);
      return unsubscribe;
    },
  };
}

export function createStore<T, Action extends ReducerAction>(store: StoreApi<T>, isReduce: boolean, dispatch = createDispatch<T, Action>(store)) {
  const write = store.setState.bind(store);
  const subscribe = (run: Subscriber<ReadonlySnapshot<T>>): Unsubscriber => {
    const initialState = readonlySnapshot(store.getState());
    const unsubscribe = store.subscribeSelector(
      (state) => readonlySnapshot(state),
      run,
      shallow,
    );

    run(initialState);
    return unsubscribe;
  };
  const select = <S>(selector: Selector<T, S>, equality?: EqualityFn<S>) => createReadable(store, selector, equality);
  const readOnly = <S = T>(selector?: Selector<T, S>): S => {
    const currentSelector = (selector ?? identity<ReadonlySnapshot<T>>) as Selector<T, S>;
    return currentSelector(readonlySnapshot(store.getState()));
  };

  if (isReduce) {
    return {
      subscribe,
      dispatch,
      select,
      writeOnly: () => dispatch,
      readOnly,
    } satisfies UseReducer<T, Action>;
  }

  return {
    subscribe,
    set: (nextState: T) => store.set(nextState),
    update: (updater: Updater<T>) => store.update(updater),
    setState: write,
    select,
    writeOnly: () => write,
    readOnly,
  } satisfies UseState<T>;
}

export function createReadonlyStore<T>(store: ReadableStore<T>): UseReadonlyState<T> {
  return {
    subscribe: createReadable(store, identity<ReadonlySnapshot<T>>).subscribe,
    select: <S>(selector: Selector<T, S>, equality?: EqualityFn<S>) => createReadable(store, selector, equality),
    readOnly: <S = ReadonlySnapshot<T>>(selector?: Selector<T, S>): S => {
      const select = (selector ?? identity<ReadonlySnapshot<T>>) as Selector<T, S>;
      return select(readonlySnapshot(store.getState()));
    },
  };
}
