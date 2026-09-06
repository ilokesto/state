import type { StoreApi, ReadableStore } from '@ilokesto/store';
import { createSignal, getOwner, onCleanup } from 'solid-js';

import type { ReducerAction } from '../../types/ReduceFn.js';
import { createDispatch } from '../shared/createDispatch.js';
import { identity } from '../shared/identity.js';
import { readonlySnapshot, type ReadonlySnapshot } from '../shared/readonlySnapshot.js';
import { shallow } from '../shared/shallow.js';
import type { Selector } from './types.js';

function createSelection<T, S>(store: ReadableStore<T>, selector: Selector<T, S>) {
  if (!getOwner()) {
    throw new Error(
      '[@ilokesto/state/solid] create() returned accessors must run inside a reactive owner such as a component or createRoot(). Use readOnly() for synchronous reads outside Solid scope.',
    );
  }

  const [selection, setSelection] = createSignal(
    selector(readonlySnapshot(store.getState())),
    { equals: Object.is },
  );
  const unsubscribe = store.subscribeSelector(
    (state) => selector(readonlySnapshot(state)),
    (nextSelection) => {
      setSelection(() => nextSelection);
    },
    shallow,
  );
  onCleanup(unsubscribe);

  return selection;
}

export function createUseAccessor<T, Action extends ReducerAction>(store: StoreApi<T>, isReduce: boolean, dispatch = createDispatch<T, Action>(store)) {
  const write = store.setState.bind(store);

  return Object.assign(
    <S = T>(selector?: Selector<T, S>) => {
      const select = (selector ?? identity<ReadonlySnapshot<T>>) as Selector<T, S>;
      const state = createSelection(store, select);

      if (isReduce) {
        return {
          state,
          dispatch,
        } as const;
      }

      return {
        state,
        setState: write,
      } as const;
    },
    {
      writeOnly: () => (isReduce ? dispatch : write),
      readOnly: <S = T>(selector?: Selector<T, S>): S => {
        const select = (selector ?? identity<ReadonlySnapshot<T>>) as Selector<T, S>;
        return select(readonlySnapshot(store.getState()));
      },
    },
  );
}
