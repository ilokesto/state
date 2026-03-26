import { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStoreFromProps';
import type { ActionStore, NextState, StoreInput } from './shared';

const applyDebounce = <T>(initialState: StoreInput<T>, wait = 300): Store<T> => {
  const store = getStore(initialState) as ActionStore<T>;
  const baseSetState = store.setState.bind(store);

  let timeout: NodeJS.Timeout | null = null;
  let updates: Array<NextState<T>> = [];

  const setState = (nextState: NextState<T>, actionName?: string) => {
    updates.push(nextState);

    if (timeout) {
      return;
    }

    timeout = setTimeout(() => {
      let currentState = store.getState() as T;

      updates.forEach((update) => {
        if (typeof update === 'function') {
          currentState = (update as (prev: Readonly<T>) => T)(currentState);
        } else {
          currentState = update;
        }
      });

      baseSetState(currentState, actionName);
      updates = [];
      timeout = null;
    }, wait);
  };

  store.setState = setState;

  return store;
};

export function debounce<T>(initialState: StoreInput<T>, wait: number | undefined): Store<T>;
export function debounce(wait?: number): <T>(initialState: StoreInput<T>) => Store<T>;
export function debounce<T>(first?: StoreInput<T> | number, second?: number) {
  if (arguments.length <= 1) {
    const wait = typeof first === 'number' ? first : undefined;

    return <State>(initialState: StoreInput<State>) => applyDebounce(initialState, wait);
  }

  return applyDebounce(first as StoreInput<T>, second);
}
