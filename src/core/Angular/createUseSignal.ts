import { Store } from '@ilokesto/store';
import { DestroyRef, computed, inject, signal } from '@angular/core';

import type {
  ActionWriter,
  AngularOptions,
  Selector,
  StateWriter,
} from './types';

const identity = <Value>(value: Value): Value => value;

function createDispatch<T, Action>(write: StateWriter<T>): ActionWriter<Action> {
  return (action) => {
    write(action as Parameters<Store<T>['setState']>[0]);
  };
}

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
  const snapshot = signal(store.getState() as T);
  const unsubscribe = store.subscribe(() => {
    snapshot.set(store.getState() as T);
  });

  resolveDestroyRef(options).onDestroy(unsubscribe);

  return computed(() => selector(snapshot()));
}

export function createUseSignal<T, Action extends object>(store: Store<T>, isReduce: boolean) {
  const write = store.setState.bind(store);
  const dispatch = createDispatch<T, Action>(write);
  const subscribe = store.subscribe.bind(store);

  return Object.assign(
    <S = T>(selectorOrOptions?: Selector<T, S> | AngularOptions, maybeOptions?: AngularOptions) => {
      const selector =
        typeof selectorOrOptions === "function"
          ? selectorOrOptions
          : ((identity as unknown) as Selector<T, S>);
      const options =
        typeof selectorOrOptions === 'function'
          ? maybeOptions
          : (selectorOrOptions as AngularOptions | undefined);
      const state = createSelection(store, selector, options);

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
