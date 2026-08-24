import type { Store } from '@ilokesto/store';

import type { Readable, Subscriber, Unsubscriber, Updater } from 'svelte/store';

import type { ReducerAction } from '../../types/ReduceFn.js';
import { createDispatch } from '../shared/createDispatch.js';
import { identity } from '../shared/identity.js';
import { readonlySnapshot, type ReadonlySnapshot } from '../shared/readonlySnapshot.js';
import { shallow } from '../shared/shallow.js';
import type { Selector, UseReducer, UseState } from './types.js';

function createReadable<T, S>(store: Store<T>, selector: Selector<T, S>): Readable<S> {
  return {
    subscribe(run: Subscriber<S>): Unsubscriber {
      const initialSelection = selector(readonlySnapshot(store.getState()));
      const unsubscribe = store.subscribeSelector(
        (state) => selector(readonlySnapshot(state)),
        run,
        shallow,
      );

      run(initialSelection);
      return unsubscribe;
    },
  };
}

export function createStore<T, Action extends ReducerAction>(store: Store<T>, isReduce: boolean) {
  const write = store.setState.bind(store);
  const dispatch = createDispatch<T, Action>(store);
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
  const select = <S>(selector: Selector<T, S>) => createReadable(store, selector);
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
    set: (nextState: T) => write(nextState),
    update: (updater: Updater<T>) => write(updater),
    setState: write,
    select,
    writeOnly: () => write,
    readOnly,
  } satisfies UseState<T>;
}
