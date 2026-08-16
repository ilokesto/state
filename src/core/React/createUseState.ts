import type { Store } from '@ilokesto/store';
import { useMemo, useSyncExternalStore } from 'react';

import { dispatchStoreAction } from '../../lib/actionMetadata.js';
import type { ReducerAction } from '../../types/ReduceFn.js';
import { shallow } from '../shared/shallow.js';
import type { UseReducer, UseState } from './types.js';

type Selector<T, S> = (state: T) => S;

const identity = <Value>(value: Value): Value => value;

function createShallowSelector<T, S>(
  selector: (state: T) => S,
): (state: T) => S {
  let previous: Readonly<{ value: S }> | undefined;

  return (state: T): S => {
    const next = selector(state);

    if (previous && shallow(previous.value, next)) {
      return previous.value;
    }

    previous = { value: next };
    return next;
  };
}

export function useStoreState<T, S, Writer>(
  store: Store<T>,
  selector: (state: T) => S,
  write: Writer,
) {
  const subscribe = useMemo(
    () => (listener: () => void) =>
      store.subscribeSelector(selector, listener, shallow),
    [store, selector],
  );

  const getSnapshot = useMemo(() => {
    const shallowSelector = createShallowSelector(selector);
    return () => shallowSelector(store.getState());
  }, [store, selector]);

  const getServerSnapshot = useMemo(() => {
    const shallowSelector = createShallowSelector(selector);
    return () => shallowSelector(store.getInitialState());
  }, [store, selector]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return [value, write] as const;
}

export function createUseState<T, Action extends ReducerAction>(
  store: Store<T>,
  isReduce: boolean,
): UseState<T> | UseReducer<T, Action> {
  const write = store.setState.bind(store);
  const dispatch = (action: Action): void => dispatchStoreAction(store, action);

  function readOnly(): T;
  function readOnly<S>(selector: Selector<T, S>): S;
  function readOnly<S>(selector?: Selector<T, S>) {
    const currentState = store.getState();

    return selector ? selector(currentState) : currentState;
  }

  function createUseSelectedState<Writer>(writer: Writer) {
    function useSelectedState(): readonly [T, Writer];
    function useSelectedState<S>(selector: Selector<T, S>): readonly [S, Writer];
    function useSelectedState(selector?: Selector<T, unknown>) {
      const select = selector ?? identity<T>;

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
