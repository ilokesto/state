import { Store } from '@ilokesto/store';
import { createMemo, from, getOwner } from 'solid-js';

import type { ActionWriter, Selector, StateWriter } from './types';

const identity = <Value>(value: Value): Value => value;

function createDispatch<T, Action>(write: StateWriter<T>): ActionWriter<Action> {
  return (action) => {
    write(action as unknown as Parameters<Store<T>['setState']>[0]);
  };
}

function createSelection<T, S>(store: Store<T>, selector: Selector<T, S>) {
  if (!getOwner()) {
    throw new Error(
      '[@ilokesto/state/solid] create() returned accessors must run inside a reactive owner such as a component or createRoot(). Use readOnly() for synchronous reads outside Solid scope.',
    );
  }

  const snapshot = from<T>(
    (set) => {
      return store.subscribe(() => {
        set(() => store.getState() as T);
      });
    },
    store.getState() as T,
  );

  return createMemo(() => selector(snapshot() as T));
}

export function createUseAccessor<T, Action extends object>(store: Store<T>, isReduce: boolean) {
  const write = store.setState.bind(store);
  const dispatch = createDispatch<T, Action>(write);

  return Object.assign(
    <S = T>(selector?: Selector<T, S>) => {
      const select = (selector ?? identity<T>) as Selector<T, S>;
      const state = createSelection(store, select);

      if (isReduce) {
        return {
          state,
          dispatch,
        } as const;
      }

      return {
        state,
        setState: write as StateWriter<T>,
      } as const;
    },
    {
      writeOnly: () => (isReduce ? dispatch : write),
      readOnly: <S = T>(selector?: Selector<T, S>): S => {
        const select = (selector ?? identity<T>) as Selector<T, S>;
        return select(store.getState() as T);
      },
    },
  );
}
