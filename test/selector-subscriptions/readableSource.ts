import type { ReadableStore } from '@ilokesto/store';
import { initialState, TrackingStore } from './helpers';

export function readableSource() {
  const backing = new TrackingStore(initialState);
  const source: ReadableStore<typeof initialState> = {
    getState() { return backing.getState(); },
    getInitialState() { return backing.getInitialState(); },
    subscribe(listener) { return backing.subscribe(listener); },
    subscribeSelector(selector, listener, equality) {
      return backing.subscribeSelector(selector, listener, equality);
    },
  };
  return { source, backing };
}

export const selectNestedCount = (state: Readonly<{ count: number }>) => ({ nested: { count: state.count } });
export const equalNestedCount = (previous: ReturnType<typeof selectNestedCount>, next: ReturnType<typeof selectNestedCount>) => previous.nested.count === next.nested.count;
