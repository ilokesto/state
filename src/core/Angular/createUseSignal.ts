import type { EqualityFn, ReadableStore, StoreApi } from '@ilokesto/store';
import { DestroyRef, inject, signal } from '@angular/core';

import type { ReducerAction } from '../../types/ReduceFn.js';
import { createDispatch } from '../shared/createDispatch.js';
import { identity } from '../shared/identity.js';
import { readonlySnapshot, type ReadonlySnapshot } from '../shared/readonlySnapshot.js';
import { shallow } from '../shared/shallow.js';
import type { AngularOptions, Selector, UseReadonlyState } from './types.js';

function resolveDestroyRef(options?: AngularOptions): DestroyRef {
  if (options?.destroyRef) {
    return options.destroyRef;
  }

  try {
    return inject(DestroyRef);
  } catch {
    throw new Error(
      '[@ilokesto/state/angular] create() returned signals must run inside an injection context or receive { destroyRef }. Use readOnly() for synchronous reads outside Angular lifecycle.',
    );
  }
}

function createSelection<T, S>(store: ReadableStore<T>, selector: Selector<T, S>, options?: AngularOptions, equality: EqualityFn<S> = shallow) {
  const destroyRef = resolveDestroyRef(options);
  const selection = signal(selector(readonlySnapshot(store.getState())));
  const unsubscribe = store.subscribeSelector(
    (state) => selector(readonlySnapshot(state)),
    (nextSelection) => {
      selection.set(nextSelection);
    },
    equality,
  );

  destroyRef.onDestroy(unsubscribe);

  return selection.asReadonly();
}

/**
 * @description Creates a callable Angular signal factory backed by a writable store.
 * Calling the factory with a selector observes that selection; without a selector,
 * it observes the readonly state snapshot. Selected values use shallow equality
 * unless an equality function is supplied as the second argument. Lifecycle options
 * can follow the selector or equality function, or be the sole argument.
 * Each call requires an Angular injection context or an explicit options.destroyRef;
 * its subscription is removed when that DestroyRef is destroyed.
 * Reducer mode exposes dispatch; otherwise, the binding exposes setState.
 * @param {StoreApi<T>} store - Store supplying state, subscriptions, and state updates.
 * @param {boolean} isReduce - Whether bindings expose dispatch instead of setState.
 * @param {(action: Action) => void} [dispatch] - Reducer action dispatcher. Defaults to
 * a dispatcher created for the supplied store.
 * @returns {ReturnType<typeof createUseSignal<T, Action>>} Callable factory returning
 * a binding with a readonly state signal, subscribe, and either dispatch or setState.
 * The factory also exposes synchronous access and subscription helpers.
 * - writeOnly `() => ((action: Action) => void) | ((nextState: import('@ilokesto/store').SetStateAction<T>) => void)` - Returns the dispatcher in reducer mode, or the bound state setter otherwise, without creating a signal subscription.
 * - readOnly `<S = T>(selector?: Selector<T, S>) => S` - Synchronously selects from the current readonly snapshot, or returns the snapshot when no selector is supplied; requires no Angular injection context.
 * - subscribe `(listener: import('@ilokesto/store').Listener) => import('@ilokesto/store').Unsubscribe` - Subscribes directly to the store and returns an unsubscribe function; callers manage this subscription's lifetime.
 * @example
 * ```ts
 * function connectCounter(store: StoreApi<{ count: number }>, destroyRef: DestroyRef) {
 *   const useCounter = createUseSignal(store, false);
 *   const counter = useCounter(state => state.count, { destroyRef });
 *   const update = useCounter.writeOnly() as StoreApi<{ count: number }>['setState'];
 *   update({ count: useCounter.readOnly(state => state.count) + 1 });
 *   return counter.state;
 * }
 * ```
 */
export function createUseSignal<T, Action extends ReducerAction>(store: StoreApi<T>, isReduce: boolean, dispatch = createDispatch<T, Action>(store)) {
  const write = store.setState.bind(store);
  const subscribe = store.subscribe.bind(store);

  return Object.assign(
    <S = T>(selectorOrOptions?: Selector<T, S> | AngularOptions, equalityOrOptions?: EqualityFn<S> | AngularOptions, options?: AngularOptions) => {
      const state =
        typeof selectorOrOptions === 'function'
          ? createSelection(
              store,
              selectorOrOptions,
              typeof equalityOrOptions === 'function' ? options : (equalityOrOptions ?? options),
              typeof equalityOrOptions === 'function' ? equalityOrOptions : shallow,
            )
          : createSelection(store, identity<ReadonlySnapshot<T>>, selectorOrOptions);

      if (isReduce) {
        return {
          state,
          dispatch,
          subscribe,
        } as const;
      }

      return {
        state,
        setState: write,
        subscribe,
      } as const;
    },
    {
      writeOnly: () => (isReduce ? dispatch : write),
      readOnly: <S = T>(selector?: Selector<T, S>): S => {
        const select = (selector ?? identity<ReadonlySnapshot<T>>) as Selector<T, S>;
        return select(readonlySnapshot(store.getState()));
      },
      subscribe,
    },
  );
}

/**
 * @description Creates a callable Angular signal factory exposing only read access
 * to a store. Calling it returns a binding containing a readonly state signal and
 * subscribe. With a selector, the signal tracks the selected value using shallow
 * equality by default; an equality function may be supplied as the second argument.
 * Without a selector, the signal tracks the readonly state snapshot.
 * Lifecycle options can follow the selector or equality function, or be the sole
 * argument. Each call requires an Angular injection context or an explicit
 * options.destroyRef, which removes the signal subscription when destroyed.
 * @param {ReadableStore<T>} store - Store providing state and subscriptions; no
 * state-writing capability is exposed by the returned factory.
 * @returns {UseReadonlyState<T>} Callable readonly signal factory with synchronous
 * read and direct subscription helpers.
 * - readOnly `<S = ReadonlySnapshot<T>>(selector?: Selector<T, S>) => S` - Synchronously selects from the current readonly snapshot, or returns the snapshot when no selector is supplied; requires no Angular injection context.
 * - subscribe `(listener: import('@ilokesto/store').Listener) => import('@ilokesto/store').Unsubscribe` - Subscribes directly to the store and returns an unsubscribe function; callers manage this subscription's lifetime.
 * @example
 * ```ts
 * function observeCount(store: ReadableStore<{ count: number }>, destroyRef: DestroyRef) {
 *   const useCounter = createReadonlySignal(store);
 *   const initialCount = useCounter.readOnly(state => state.count);
 *   const { state: count } = useCounter(state => state.count, { destroyRef });
 *   return { initialCount, count };
 * }
 * ```
 */
export function createReadonlySignal<T>(store: ReadableStore<T>): UseReadonlyState<T> {
  const subscribe = store.subscribe.bind(store);
  return Object.assign(
    <S = ReadonlySnapshot<T>>(selectorOrOptions?: Selector<T, S> | AngularOptions, equalityOrOptions?: EqualityFn<S> | AngularOptions, options?: AngularOptions) => {
      const state = typeof selectorOrOptions === 'function'
        ? createSelection(
            store,
            selectorOrOptions,
            typeof equalityOrOptions === 'function' ? options : (equalityOrOptions ?? options),
            typeof equalityOrOptions === 'function' ? equalityOrOptions : shallow,
          )
        : createSelection(store, identity<ReadonlySnapshot<T>>, selectorOrOptions);
      return { state, subscribe };
    },
    {
      readOnly: <S = ReadonlySnapshot<T>>(selector?: Selector<T, S>): S => {
        const select = (selector ?? identity<ReadonlySnapshot<T>>) as Selector<T, S>;
        return select(readonlySnapshot(store.getState()));
      },
      subscribe,
    },
  );
}
