import type { Store } from '@ilokesto/store';
import { createSignal, getOwner, onCleanup } from 'solid-js';

import type { ReducerAction } from '../../types/ReduceFn.js';
import { createDispatch } from '../shared/createDispatch.js';
import { identity } from '../shared/identity.js';
import { shallow } from '../shared/shallow.js';
import type { ActionWriter, Selector, StateWriter } from './types.js';

function createSelection<T, S>(store: Store<T>, selector: Selector<T, S>) {
  if (!getOwner()) {
    throw new Error(
      '[@ilokesto/state/solid] create() returned accessors must run inside a reactive owner such as a component or createRoot(). Use readOnly() for synchronous reads outside Solid scope.',
    );
  }

  const [selection, setSelection] = createSignal(
    selector(store.getState() as T),
    { equals: Object.is },
  );
  const unsubscribe = store.subscribeSelector(
    selector,
    (nextSelection) => {
      setSelection(() => nextSelection);
    },
    shallow,
  );
  onCleanup(unsubscribe);

  return selection;
}

export function createUseAccessor<T, Action extends ReducerAction>(store: Store<T>, isReduce: boolean) {
  const write = store.setState.bind(store);
  const dispatch = createDispatch<T, Action>(store);

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
