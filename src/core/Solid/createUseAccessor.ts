import type { EqualityFn, ReadableStore, StoreApi } from '@ilokesto/store';
import { createSignal, getOwner, onCleanup } from 'solid-js';

import type { ReducerAction } from '../../types/ReduceFn.js';
import { createDispatch } from '../shared/createDispatch.js';
import { identity } from '../shared/identity.js';
import { readonlySnapshot, type ReadonlySnapshot } from '../shared/readonlySnapshot.js';
import { shallow } from '../shared/shallow.js';
import type { Selector, UseReadonlyState } from './types.js';

function createSelection<T, S>(store: ReadableStore<T>, selector: Selector<T, S>, equality: EqualityFn<S> = shallow) {
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
    equality,
  );
  onCleanup(unsubscribe);

  return selection;
}

/**
 * @description Creates a Solid accessor factory backed by a writable store.
 * Calling the factory requires a reactive owner, returns an object containing a selected state accessor,
 * and subscribes until that owner is cleaned up. Selection uses a readonly snapshot;
 * omitted selectors select the whole snapshot, and omitted equality functions use
 * shallow comparison. Reducer mode exposes dispatch; otherwise it exposes setState.
 * The attached writeOnly and synchronous readOnly helpers need no reactive owner.
 * @param {StoreApi<T>} store - Store providing state, selector subscriptions, and writes.
 * @param {boolean} isReduce - Whether factory results expose dispatch instead of setState.
 * @param {(action: Action) => void} [dispatch] - Reducer dispatcher; defaults to a dispatcher created from the store.
 * @returns {(<S = T>(selector?: Selector<T, S>, equality?: EqualityFn<S>) => { readonly state: import('solid-js').Accessor<S>; readonly dispatch: (action: Action) => void; readonly setState?: undefined } | { readonly state: import('solid-js').Accessor<S>; readonly setState: (nextState: import('@ilokesto/store').SetStateAction<T>) => void; readonly dispatch?: undefined }) & { writeOnly: () => ((action: Action) => void) | ((nextState: import('@ilokesto/store').SetStateAction<T>) => void); readOnly: <S = T>(selector?: Selector<T, S>) => S }} Accessor factory with nonreactive read and write helpers.
 * - writeOnly `() => ((action: Action) => void) | ((nextState: import('@ilokesto/store').SetStateAction<T>) => void)` - Returns dispatch in reducer mode, or the store's bound setState otherwise.
 * - readOnly `<S = T>(selector?: Selector<T, S>) => S` - Synchronously selects from the current readonly snapshot without subscribing.
 * @example
 * ```ts
 * import { createRoot } from 'solid-js';
 *
 * // Use an existing writable counter store.
 * declare const counterStore: StoreApi<{ count: number }>;
 * const useCounter = createUseAccessor(counterStore, false);
 *
 * createRoot((dispose) => {
 *   const counter = useCounter((state) => state.count);
 *   console.log(counter.state());
 *   counter.setState?.({ count: 1 });
 *   dispose(); // Removes the selection subscription.
 * });
 *
 * console.log(useCounter.readOnly((state) => state.count));
 * ```
 */
export function createUseAccessor<T, Action extends ReducerAction>(store: StoreApi<T>, isReduce: boolean, dispatch = createDispatch<T, Action>(store)) {
  const write = store.setState.bind(store);

  return Object.assign(
    <S = T>(selector?: Selector<T, S>, equality?: EqualityFn<S>) => {
      const select = (selector ?? identity<ReadonlySnapshot<T>>) as Selector<T, S>;
      const state = createSelection(store, select, equality);

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

/**
 * @description Creates a read-only Solid accessor factory. Calling the factory
 * requires a reactive owner and returns an object containing a state accessor subscribed to the selected
 * readonly snapshot until owner cleanup. The selector defaults to the whole
 * snapshot, and equality defaults to shallow comparison. The attached readOnly
 * helper reads synchronously without an owner or subscription.
 * @param {ReadableStore<T>} store - Store supplying current state and selector subscriptions.
 * @returns {UseReadonlyState<T>} Read-only accessor factory with a synchronous read helper.
 * - readOnly `<S = ReadonlySnapshot<T>>(selector?: Selector<T, S>) => S` - Returns the selected current snapshot, or the whole readonly snapshot when no selector is supplied.
 * @example
 * ```ts
 * import { createRoot } from 'solid-js';
 *
 * // Use an existing readable counter store.
 * declare const counterStore: ReadableStore<{ count: number }>;
 * const useCounter = createReadonlyAccessor(counterStore);
 *
 * createRoot((dispose) => {
 *   const { state } = useCounter((snapshot) => snapshot.count);
 *   console.log(state());
 *   dispose(); // Removes the selection subscription.
 * });
 *
 * const currentCount = useCounter.readOnly((snapshot) => snapshot.count);
 * ```
 */
export function createReadonlyAccessor<T>(store: ReadableStore<T>): UseReadonlyState<T> {
  return Object.assign(
    <S = ReadonlySnapshot<T>>(selector?: Selector<T, S>, equality?: EqualityFn<S>) => {
      const select = (selector ?? identity<ReadonlySnapshot<T>>) as Selector<T, S>;
      return { state: createSelection(store, select, equality) };
    },
    {
      readOnly: <S = ReadonlySnapshot<T>>(selector?: Selector<T, S>): S => {
        const select = (selector ?? identity<ReadonlySnapshot<T>>) as Selector<T, S>;
        return select(readonlySnapshot(store.getState()));
      },
    },
  );
}
