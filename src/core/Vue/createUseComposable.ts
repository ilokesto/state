import type { Store } from '@ilokesto/store';
import { computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue';

import type { ReducerAction } from '../../types/ReduceFn.js';
import { createDispatch } from '../shared/createDispatch.js';
import { identity } from '../shared/identity.js';
import { shallow } from '../shared/shallow.js';
import type { ActionWriter, Selector, StateWriter } from './types.js';

function createSelection<T, S>(store: Store<T>, selector: Selector<T, S>) {
  if (!getCurrentScope()) {
    throw new Error(
      '[@ilokesto/state/vue] create() returned composables must run inside setup() or an active effectScope(). Use readOnly() for synchronous reads outside Vue scope.',
    );
  }

  const snapshot = shallowRef(selector(store.getState() as T));

  const unsubscribe = store.subscribeSelector(
    selector,
    (nextSelection) => {
      snapshot.value = nextSelection as typeof snapshot.value;
    },
    shallow,
  );

  onScopeDispose(unsubscribe);

  return computed(() => snapshot.value as S);
}

export function createUseComposable<T, Action extends ReducerAction>(store: Store<T>, isReduce: boolean) {
  const write = store.setState.bind(store);
  const dispatch = createDispatch<T, Action>(store);

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
