import { Store } from '@ilokesto/store';
import { computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue';

import type { ActionWriter, Selector, StateWriter } from './types';

const identity = <Value>(value: Value): Value => value;

function createDispatch<T, Action>(write: StateWriter<T>): ActionWriter<Action> {
  return (action) => {
    write(action as unknown as Parameters<Store<T>['setState']>[0]);
  };
}

function createSelection<T, S>(store: Store<T>, selector: Selector<T, S>) {
  if (!getCurrentScope()) {
    throw new Error(
      '[@ilokesto/state/vue] create() returned composables must run inside setup() or an active effectScope(). Use readOnly() for synchronous reads outside Vue scope.',
    );
  }

  const snapshot = shallowRef(store.getState());

  const unsubscribe = store.subscribe(() => {
    snapshot.value = store.getState();
  });

  onScopeDispose(unsubscribe);

  return computed(() => selector(snapshot.value as T));
}

export function createUseComposable<T, Action extends object>(store: Store<T>, isReduce: boolean) {
  const write = store.setState.bind(store);
  const dispatch = createDispatch<T, Action>(write);

  return Object.assign(
    <S = T>(selector?: Selector<T, S>) => {
      const select = (selector ?? identity<T>) as Selector<T, S>;
      const state = createSelection(store, select);

      if (isReduce) {
        return {
          state,
          dispatch,
        } as const;
      }

      return {
        state,
        setState: write as StateWriter<T>,
      } as const;
    },
    {
      writeOnly: () => (isReduce ? dispatch : write),
      readOnly: <S = T>(selector?: Selector<T, S>): S => {
        const select = (selector ?? identity<T>) as Selector<T, S>;
        return select(store.getState() as T);
      },
    },
  );
}
