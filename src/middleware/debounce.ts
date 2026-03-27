import { Store } from '@ilokesto/store';
import { SetStateAction } from 'react';
import { getStore } from '../lib/getStore';

type Dispatch<A> = (value: A) => void;

const applyDebounce = <T>(initialState: T | Store<T>, wait = 300): Store<T> => {
  const store = getStore(initialState);

  let timeout: NodeJS.Timeout | null = null;
  let updates: Array<SetStateAction<T>> = [];
  let savedNext: Dispatch<SetStateAction<T>> | null = null;

  store.pushMiddleware((nextState: SetStateAction<T>, next) => {
    updates.push(nextState);
    savedNext = next;

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

      const pendingNext = savedNext;
      updates = [];
      timeout = null;
      savedNext = null;

      if (pendingNext) {
        pendingNext(currentState);
      }
    }, wait);
  });

  return store;
};

export function debounce<T>(initialState: T | Store<T>, wait: number | undefined): Store<T>;
export function debounce(wait?: number): <T>(initialState: T | Store<T>) => Store<T>;
export function debounce<T>(first?: T | Store<T> | number, second?: number) {
  if (arguments.length <= 1) {
    const wait = typeof first === 'number' ? first : undefined;

    return (initialState: T | Store<T>) => applyDebounce(initialState, wait);
  }

  return applyDebounce(first as T | Store<T>, second);
}
