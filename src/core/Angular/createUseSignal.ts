import type { Store } from '@ilokesto/store';
import { DestroyRef, inject, signal } from '@angular/core';

import type { ReducerAction } from '../../types/ReduceFn.js';
import { createDispatch } from '../shared/createDispatch.js';
import { identity } from '../shared/identity.js';
import { shallow } from '../shared/shallow.js';
import type {
  ActionWriter,
  AngularOptions,
  Selector,
  StateWriter,
} from './types.js';

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

function createSelection<T, S>(store: Store<T>, selector: Selector<T, S>, options?: AngularOptions) {
  const destroyRef = resolveDestroyRef(options);
  const selection = signal(selector(store.getState() as T));
  const unsubscribe = store.subscribeSelector(
    selector,
    (nextSelection) => {
      selection.set(nextSelection);
    },
    shallow,
  );

  destroyRef.onDestroy(unsubscribe);

  return selection.asReadonly();
}

export function createUseSignal<T, Action extends ReducerAction>(store: Store<T>, isReduce: boolean) {
  const write = store.setState.bind(store);
  const dispatch = createDispatch<T, Action>(store);
  const subscribe = store.subscribe.bind(store);

  return Object.assign(
    <S = T>(selectorOrOptions?: Selector<T, S> | AngularOptions, maybeOptions?: AngularOptions) => {
      const state =
        typeof selectorOrOptions === 'function'
          ? createSelection(store, selectorOrOptions, maybeOptions)
          : createSelection(store, identity<T>, selectorOrOptions);

      if (isReduce) {
        return {
          state,
          dispatch,
          subscribe,
        } as const;
      }

      return {
        state,
        setState: write as StateWriter<T>,
        subscribe,
      } as const;
    },
    {
      writeOnly: () => (isReduce ? dispatch : write),
      readOnly: <S = T>(selector?: Selector<T, S>): S => {
        const select = (selector ?? identity<T>) as Selector<T, S>;
        return select(store.getState() as T);
      },
      subscribe,
    },
  );
}
