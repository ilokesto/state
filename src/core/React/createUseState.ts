import type { StoreApi, ReadableStore } from '@ilokesto/store';
import { useMemo, useSyncExternalStore } from 'react';

import { createDispatch } from '../shared/createDispatch.js';
import type { ReducerAction } from '../../types/ReduceFn.js';
import { identity } from '../shared/identity.js';
import {
  readonlySnapshot,
  type ReadonlySnapshot,
} from '../shared/readonlySnapshot.js';
import { shallow } from '../shared/shallow.js';
import type { UseReducer, UseState } from './types.js';

type Selector<T, S> = (state: ReadonlySnapshot<T>) => S;

function createShallowSelector<T, S>(
  selector: (state: ReadonlySnapshot<T>) => S,
): (state: ReadonlySnapshot<T>) => S {
  let previous: Readonly<{ value: S }> | undefined;

  return (state: ReadonlySnapshot<T>): S => {
    const next = selector(state);

    if (previous && shallow(previous.value, next)) {
      return previous.value;
    }

    previous = { value: next };
    return next;
  };
}

export function useStoreState<T, S, Writer>(
  store: ReadableStore<T>,
  selector: (state: ReadonlySnapshot<T>) => S,
  write: Writer,
) {
  const subscribe = useMemo(
    () => (listener: () => void) =>
      store.subscribeSelector(
        (state) => selector(readonlySnapshot(state)),
        listener,
        shallow,
      ),
    [store, selector],
  );

  const getSnapshot = useMemo(() => {
    const shallowSelector = createShallowSelector(selector);
    return () => shallowSelector(readonlySnapshot(store.getState()));
  }, [store, selector]);

  const getServerSnapshot = useMemo(() => {
    const shallowSelector = createShallowSelector(selector);
    return () => shallowSelector(readonlySnapshot(store.getInitialState()));
  }, [store, selector]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return [value, write] as const;
}

export function createUseState<T, Action extends ReducerAction>(
  store: StoreApi<T>,
  isReduce: boolean,
  dispatch = createDispatch<T, Action>(store),
): UseState<T> | UseReducer<T, Action> {
  const write = store.setState.bind(store);

  function readOnly(): ReadonlySnapshot<T>;
  function readOnly<S>(selector: Selector<T, S>): S;
  function readOnly<S>(selector?: Selector<T, S>) {
    const currentState = readonlySnapshot(store.getState());

    return selector ? selector(currentState) : currentState;
  }

  function createUseSelectedState<Writer>(writer: Writer) {
    function useSelectedState(): readonly [ReadonlySnapshot<T>, Writer];
    function useSelectedState<S>(selector: Selector<T, S>): readonly [S, Writer];
    function useSelectedState(selector?: Selector<T, unknown>) {
      const select = selector ?? identity<ReadonlySnapshot<T>>;

      return useStoreState(store, select, writer);
    }

    return useSelectedState;
  }

  if (isReduce) {
    return Object.assign(createUseSelectedState(dispatch), {
      writeOnly: () => dispatch,
      readOnly,
    }) satisfies UseReducer<T, Action>;
  }

  return Object.assign(createUseSelectedState(write), {
    writeOnly: () => write,
    readOnly,
  }) satisfies UseState<T>;
}
