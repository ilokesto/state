import type { EqualityFn, ReadableStore, Selector, Unsubscribe } from '@ilokesto/store';
import { listenActions } from './listenActions.js';
import type { EffectCallback, EffectOptions } from './listenActions.js';

export type SelectorEffectOptions<Selection> = EffectOptions & {
  readonly equalityFn?: EqualityFn<Selection>;
  /** Run once on registration. Defaults to true. */
  readonly fireImmediately?: boolean;
};

/** Observe a selected value through the store's public subscription contract. */
export function createEffect<T, Selection>(
  store: ReadableStore<T>,
  selector: Selector<T, Selection>,
  effect: EffectCallback<Selection>,
  options: SelectorEffectOptions<Selection>,
): Unsubscribe {
  return listenActions({
    subscribe(listener) {
      const unsubscribe = store.subscribeSelector(
        selector,
        (selection) => listener(selection),
        options.equalityFn,
      );
      try {
        if (options.fireImmediately !== false) {
          listener(selector(store.getState()));
        }
      } catch (error) {
        unsubscribe();
        throw error;
      }
      return unsubscribe;
    },
  }, effect, options);
}
