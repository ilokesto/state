import type { Store } from '@ilokesto/store';

import type { Readable, Subscriber, Unsubscriber, Updater } from 'svelte/store';

import type { ReducerAction } from '../../types/ReduceFn.js';
import { createDispatch } from '../shared/createDispatch.js';
import { identity } from '../shared/identity.js';
import { shallow } from '../shared/shallow.js';
import type {
  ActionWriter,
  Selector,
  UseReducer,
  UseState,
} from './types.js';

function createReadable<T, S>(store: Store<T>, selector: Selector<T, S>): Readable<S> {
  return {
    subscribe(run: Subscriber<S>): Unsubscriber {
      const initialSelection = selector(store.getState() as T);
      const unsubscribe = store.subscribeSelector(selector, run, shallow);

      run(initialSelection);
      return unsubscribe;
    },
  };
}

export function createStore<T, Action extends ReducerAction>(store: Store<T>, isReduce: boolean) {
  const write = store.setState.bind(store);
  const dispatch = createDispatch<T, Action>(store);
  const subscribe = (run: Subscriber<T>): Unsubscriber => {
    const initialState = store.getState() as T;
    const unsubscribe = store.subscribeSelector(identity<T>, run, shallow);

    run(initialState);
    return unsubscribe;
  };
  const select = <S>(selector: Selector<T, S>) => createReadable(store, selector);
  const readOnly = <S = T>(selector?: Selector<T, S>): S => {
    const currentSelector = (selector ?? identity<T>) as Selector<T, S>;
    return currentSelector(store.getState() as T);
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
