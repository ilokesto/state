import { Store, createScope, createStateFactory } from '../../../dist/index.js';
import { registerStoreCleanup } from '../../../dist/lib/storeCleanup.js';

export { createScope };
export const selectCount = state => state.count;
export const selectLabel = state => state.label;

class TrackedStore extends Store {
  active = 0;
  cleaned = 0;
  subscribeSelector(selector, listener, equality) {
    this.active++;
    const unsubscribe = super.subscribeSelector(selector, listener, equality);
    return () => { this.active--; unsubscribe(); };
  }
}

export const factory = createStateFactory({
  decode(input) {
    if (
      typeof input !== 'object' || input === null ||
      !Number.isSafeInteger(input.count) || typeof input.label !== 'string'
    ) throw new TypeError('Invalid counter');
    return { count: input.count, label: input.label };
  },
  create(initial) {
    const store = new TrackedStore(initial);
    registerStoreCleanup(store, () => store.cleaned++);
    return store;
  },
});
