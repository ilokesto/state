import type { EqualityFn, ReadableStore, StoreApi } from '@ilokesto/store';
import { useMemo, useSyncExternalStore } from 'react';

import { createDispatch } from '../shared/createDispatch.js';
import type { ReducerAction } from '../../types/ReduceFn.js';
import { identity } from '../shared/identity.js';
import {
  readonlySnapshot,
  type ReadonlySnapshot,
} from '../shared/readonlySnapshot.js';
import { shallow } from '../shared/shallow.js';
import type { UseReadonlyState, UseReducer, UseState } from './types.js';

type Selector<T, S> = (state: ReadonlySnapshot<T>) => S;

function createEqualSelector<T, S>(
  selector: (state: ReadonlySnapshot<T>) => S,
  equality: EqualityFn<S>,
): (state: ReadonlySnapshot<T>) => S {
  let previous: Readonly<{ value: S }> | undefined;

  return (state: ReadonlySnapshot<T>): S => {
    const next = selector(state);

    if (previous && equality(previous.value, next)) {
      return previous.value;
    }

    previous = { value: next };
    return next;
  };
}

function useStoreSelection<T, S>(
  store: ReadableStore<T>,
  selector: (state: ReadonlySnapshot<T>) => S,
  equality: EqualityFn<S> = shallow,
) {
  const subscribe = useMemo(
    () => (listener: () => void) =>
      store.subscribeSelector(
        (state) => selector(readonlySnapshot(state)),
        listener,
        equality,
      ),
    [store, selector, equality],
  );

  const getSnapshot = useMemo(() => {
    const select = createEqualSelector(selector, equality);
    return () => select(readonlySnapshot(store.getState()));
  }, [store, selector, equality]);

  const getServerSnapshot = useMemo(() => {
    const select = createEqualSelector(selector, equality);
    return () => select(readonlySnapshot(store.getInitialState()));
  }, [store, selector, equality]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return value;
}

/**
 * @description Creates a React hook that subscribes to a store's readonly
 * snapshot or a selected value. The hook returns the selected value and a
 * writer: the supplied dispatch in reducer mode, or the bound store setter
 * otherwise. Selectors receive readonly snapshots; selection equality defaults
 * to shallow comparison. Server rendering reads the store's initial state.
 * @param {StoreApi<T>} store - Store to read, subscribe to, and update.
 * @param {boolean} isReduce - Whether the hook returns a reducer dispatch
 * instead of the store setter.
 * @param {(action: Action) => void} [dispatch] - Dispatch returned in reducer
 * mode; defaults to a dispatch created from the store. Ignored outside reducer mode.
 * @returns {UseState<T> | UseReducer<T, Action>} A selection hook returning a
 * readonly pair of the selected snapshot and writer, with imperative controls.
 * - writeOnly `(UseState<T> | UseReducer<T, Action>)['writeOnly']` - Returns the
 * bound store setter or reducer dispatch without subscribing to state changes.
 * - readOnly `(UseState<T> | UseReducer<T, Action>)['readOnly']` - Reads the
 * current readonly snapshot, or applies a selector to it, without subscribing.
 * @example
 * ```tsx
 * // counterStore is an existing StoreApi<{ count: number }>.
 * const useCounter = createUseState(counterStore, false);
 *
 * function Count() {
 *   const [count] = useCounter((state) => state.count);
 *   return <span>{count}</span>;
 * }
 *
 * const currentCount = useCounter.readOnly((state) => state.count);
 * ```
 */
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
    function useSelectedState<S>(selector: Selector<T, S>, equality?: EqualityFn<S>): readonly [S, Writer];
    function useSelectedState(selector?: Selector<T, unknown>, equality?: EqualityFn<unknown>) {
      const select = selector ?? identity<ReadonlySnapshot<T>>;

      return [useStoreSelection(store, select, equality), writer] as const;
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

/**
 * @description Creates a read-only React hook that subscribes to the full store
 * snapshot or a selected value. Selectors receive readonly snapshots, and
 * selection equality defaults to shallow comparison. Server rendering reads
 * the store's initial state. No writer is exposed.
 * @param {ReadableStore<T>} store - Store supplying snapshots and selection
 * subscriptions.
 * @returns {UseReadonlyState<T>} A hook returning the readonly snapshot or
 * selected value, with an imperative read control.
 * - readOnly `UseReadonlyState<T>['readOnly']` - Reads the current readonly
 * snapshot, or applies a selector to it, without subscribing to changes.
 * @example
 * ```tsx
 * // counterStore is an existing ReadableStore<{ count: number }>.
 * const useCount = createReadonlyState(counterStore);
 *
 * function Count() {
 *   const count = useCount((state) => state.count);
 *   return <span>{count}</span>;
 * }
 *
 * const currentCount = useCount.readOnly((state) => state.count);
 * ```
 */
export function createReadonlyState<T>(store: ReadableStore<T>): UseReadonlyState<T> {
  function useSelectedState(): ReadonlySnapshot<T>;
  function useSelectedState<S>(selector: Selector<T, S>, equality?: EqualityFn<S>): S;
  function useSelectedState(selector?: Selector<T, unknown>, equality?: EqualityFn<unknown>) {
    return useStoreSelection(store, selector ?? identity<ReadonlySnapshot<T>>, equality);
  }
  function readOnly(): ReadonlySnapshot<T>;
  function readOnly<S>(selector: Selector<T, S>): S;
  function readOnly(selector?: Selector<T, unknown>) {
    const state = readonlySnapshot(store.getState());
    return selector ? selector(state) : state;
  }
  return Object.assign(useSelectedState, { readOnly });
}
