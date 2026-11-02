import type { EqualityFn, ReadableStore, StoreApi } from '@ilokesto/store';
import { computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue';

import type { ReducerAction } from '../../types/ReduceFn.js';
import { createDispatch } from '../shared/createDispatch.js';
import { identity } from '../shared/identity.js';
import { readonlySnapshot, type ReadonlySnapshot } from '../shared/readonlySnapshot.js';
import { shallow } from '../shared/shallow.js';
import type { Selector, UseReadonlyState } from './types.js';

function createSelection<T, S>(store: ReadableStore<T>, selector: Selector<T, S>, equality: EqualityFn<S> = shallow) {
  if (!getCurrentScope()) {
    throw new Error(
      '[@ilokesto/state/vue] create() returned composables must run inside setup() or an active effectScope(). Use readOnly() for synchronous reads outside Vue scope.',
    );
  }

  const snapshot = shallowRef(selector(readonlySnapshot(store.getState())));

  const unsubscribe = store.subscribeSelector(
    (state) => selector(readonlySnapshot(state)),
    (nextSelection) => {
      snapshot.value = nextSelection as typeof snapshot.value;
    },
    equality,
  );

  onScopeDispose(unsubscribe);

  return computed(() => snapshot.value as S);
}

/**
 * @description Creates a Vue composable that subscribes to a selected readonly
 * snapshot of the store. Calling the composable requires setup() or an active
 * effectScope(); its subscription is removed when that scope is disposed.
 * Selection equality defaults to shallow comparison. Reducer mode exposes
 * dispatch; otherwise the result exposes the store's bound setState method.
 * The attached readOnly and writeOnly helpers do not require a Vue scope.
 * @param {StoreApi<T>} store - Store to observe and update.
 * @param {boolean} isReduce - Whether to expose dispatch instead of setState.
 * @param {(action: Action) => void} [dispatch] - Reducer-mode dispatcher;
 * defaults to createDispatch(store).
 * @returns {(<S = T>(selector?: Selector<T, S>, equality?: EqualityFn<S>) => { readonly state: import('vue').ComputedRef<S>; readonly dispatch: (action: Action) => void; readonly setState?: undefined } | { readonly state: import('vue').ComputedRef<S>; readonly setState: (nextState: import('@ilokesto/store').SetStateAction<T>) => void; readonly dispatch?: undefined }) & { writeOnly: () => ((action: Action) => void) | ((nextState: import('@ilokesto/store').SetStateAction<T>) => void); readOnly: <S = T>(selector?: Selector<T, S>) => S }} Callable composable returning a computed selection and the mode-specific writer.
 * - writeOnly `() => ((action: Action) => void) | ((nextState: import('@ilokesto/store').SetStateAction<T>) => void)` - Returns dispatch in reducer mode or the bound setState method otherwise, without subscribing.
 * - readOnly `<S = T>(selector?: Selector<T, S>) => S` - Synchronously selects from the current readonly snapshot without subscribing; omitting the selector returns that snapshot.
 * @example
 * ```ts
 * import { effectScope } from 'vue';
 *
 * // counterStore is an existing StoreApi<{ count: number }>.
 * const useCounter = createUseComposable(counterStore, false);
 * const scope = effectScope();
 * scope.run(() => {
 *   const counter = useCounter(state => state.count);
 *   console.log(counter.state.value);
 *   counter.setState?.({ count: 1 });
 * });
 * console.log(useCounter.readOnly(state => state.count));
 * scope.stop();
 * ```
 */
export function createUseComposable<T, Action extends ReducerAction>(store: StoreApi<T>, isReduce: boolean, dispatch = createDispatch<T, Action>(store)) {
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
 * @description Creates a read-only Vue composable returning a computed selection
 * of the store's readonly snapshot. Calling it requires setup() or an active
 * effectScope(); the subscription is removed when that scope is disposed.
 * The optional selector defaults to the whole snapshot, and selection equality
 * defaults to shallow comparison. No write operation is exposed.
 * @param {ReadableStore<T>} store - Readable store supplying snapshots and selection subscriptions.
 * @returns {UseReadonlyState<T>} Callable composable returning a computed state selection, with a synchronous read helper.
 * - readOnly `<S = ReadonlySnapshot<T>>(selector?: Selector<T, S>) => S` - Reads the current readonly snapshot, optionally selecting a value, without subscribing or requiring a Vue scope.
 * @example
 * ```ts
 * import { effectScope } from 'vue';
 *
 * // counterStore is an existing ReadableStore<{ count: number }>.
 * const useCounter = createReadonlyComposable(counterStore);
 * console.log(useCounter.readOnly(state => state.count));
 * const scope = effectScope();
 * scope.run(() => {
 *   const { state: count } = useCounter(state => state.count);
 *   console.log(count.value);
 * });
 * scope.stop();
 * ```
 */
export function createReadonlyComposable<T>(store: ReadableStore<T>): UseReadonlyState<T> {
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
