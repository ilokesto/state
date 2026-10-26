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
