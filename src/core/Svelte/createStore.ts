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

/**
 * @description Adapts a store to Svelte subscriptions and either reducer dispatch
 * or direct state writes. Subscriptions emit the current readonly snapshot
 * immediately, then emit changes using shallow equality. Selected subscriptions
 * default to shallow equality; readOnly reads a snapshot without subscribing.
 * @param {StoreApi<T>} store - Store supplying state, subscriptions, and writes.
 * @param {boolean} isReduce - Whether to expose reducer dispatch instead of direct state writes.
 * @param {(action: Action) => void} [dispatch] - Reducer dispatcher; defaults to a dispatcher created for the store.
 * @returns {UseReducer<T, Action> | UseState<T>} The reducer adapter when isReduce is true, otherwise the writable adapter.
 * - subscribe `(run: Subscriber<ReadonlySnapshot<T>>) => Unsubscriber` - Immediately delivers the current snapshot and subscribes to shallowly distinct snapshots; returns an unsubscribe function.
 * - dispatch `((action: Action) => void) | undefined` - Dispatches actions in reducer mode; absent in writable mode.
 * - select `<S>(selector: Selector<T, S>, equality?: EqualityFn<S>) => Readable<S>` - Creates a readable selection with immediate delivery and optional equality comparison, defaulting to shallow.
 * - writeOnly `(() => (action: Action) => void) | (() => (nextState: import('@ilokesto/store').SetStateAction<T>) => void)` - Returns the dispatcher in reducer mode or the bound state writer in writable mode.
 * - readOnly `<S = T>(selector?: Selector<T, S>) => S` - Reads the current readonly snapshot, optionally applying a selector, without subscribing.
 * - set `((nextState: T) => void) | undefined` - Replaces state through the underlying store in writable mode; absent in reducer mode.
 * - update `((updater: Updater<T>) => void) | undefined` - Updates state through the underlying store in writable mode; absent in reducer mode.
 * - setState `((nextState: import('@ilokesto/store').SetStateAction<T>) => void) | undefined` - Bound state writer accepting a value or updater in writable mode; absent in reducer mode.
 * @example
 * ```ts
 * // Adapt an existing application store for a Svelte subscriber.
 * declare const counterStore: StoreApi<{ count: number }>;
 * const counter = createStore(counterStore, false);
 * const count = counter.select((state) => state.count);
 * const unsubscribe = count.subscribe((value) => console.log(value));
 * counter.set?.({ count: 1 });
 * console.log(counter.readOnly((state) => state.count));
 * unsubscribe();
 * ```
 */
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

/**
 * @description Creates a readonly Svelte adapter without exposing state writers.
 * Subscriptions immediately deliver the current readonly snapshot and then
 * shallowly distinct snapshots. Selected subscriptions also default to shallow
 * equality. Imperative reads do not establish subscriptions.
 * @param {ReadableStore<T>} store - Store supplying current state and selector subscriptions.
 * @returns {UseReadonlyState<T>} A readonly adapter for subscriptions, selections, and immediate snapshot reads.
 * - select `<S>(selector: Selector<T, S>, equality?: EqualityFn<S>) => Readable<S>` - Creates a readable selection that immediately emits its current value and uses the supplied equality function, or shallow equality, for subsequent changes.
 * - readOnly `<S = ReadonlySnapshot<T>>(selector?: Selector<T, S>) => S` - Returns the current readonly snapshot, or the selector result, without subscribing.
 * @example
 * ```ts
 * declare const counterStore: ReadableStore<{ count: number }>;
 * const counter = createReadonlyStore(counterStore);
 * const count = counter.select((state) => state.count);
 * const unsubscribe = count.subscribe((value) => console.log(value));
 * const currentCount = counter.readOnly((state) => state.count);
 * console.log(currentCount);
 * unsubscribe();
 * ```
 */
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
