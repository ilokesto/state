import { Store } from '@ilokesto/store';

import type { Readable, Subscriber, Unsubscriber, Updater } from 'svelte/store';

import type {
  ActionWriter,
  Selector,
  StateWriter,
  UseReducer,
  UseState,
} from './types';

const identity = <Value>(value: Value): Value => value;

function createDispatch<T, Action>(write: StateWriter<T>): ActionWriter<Action> {
  return (action) => {
    write(action as Parameters<Store<T>['setState']>[0]);
  };
}

function createReadable<T, S>(store: Store<T>, selector: Selector<T, S>): Readable<S> {
  return {
    subscribe(run: Subscriber<S>): Unsubscriber {
      run(selector(store.getState() as T));

      return store.subscribe(() => {
        run(selector(store.getState() as T));
      });
    },
  };
}

export function createStore<T, Action extends object>(store: Store<T>, isReduce: boolean) {
  const write = store.setState.bind(store);
  const dispatch = createDispatch<T, Action>(write);
  const subscribe = (run: Subscriber<T>): Unsubscriber => {
    run(store.getState() as T);

    return store.subscribe(() => {
      run(store.getState() as T);
    });
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
