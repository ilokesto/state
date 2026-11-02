import type { EqualityFn, ReadableStore, Selector, Unsubscribe } from '@ilokesto/store';
import { listenActions } from './listenActions.js';
import type { EffectCallback, EffectOptions } from './listenActions.js';

export type SelectorEffectOptions<Selection> = EffectOptions & {
  /** Compares selected values to suppress equivalent updates; omitted to use the store's default comparison. */
  readonly equalityFn?: EqualityFn<Selection>;
  /** Run once on registration. Defaults to true. */
  readonly fireImmediately?: boolean;
};

/**
 * @description Observe a selected value through the store's public subscription contract.
 * Delegates effect execution and error handling to listenActions. Unless
 * fireImmediately is false, supplies the current selection during registration.
 * If that initial notification throws, removes the subscription and rethrows.
 * @param {ReadableStore<T>} store - Store whose selected state is observed.
 * @param {Selector<T, Selection>} selector - Extracts the value supplied to the effect.
 * @param {EffectCallback<Selection>} effect - Effect executed for selected values by listenActions.
 * @param {SelectorEffectOptions<Selection>} options - Error handling and selection notification settings.
 * @param {(error: unknown) => void} options.onError - Error handler passed to listenActions.
 * @param {EqualityFn<Selection>} [options.equalityFn] - Comparison used by the store to suppress equivalent selected values; omitted to use its default.
 * @param {boolean} [options.fireImmediately] - Whether to notify with the current selection during registration; defaults to true.
 * @returns {Unsubscribe} Function that unsubscribes the effect from further selection notifications.
 * @example
 * ```ts
 * function logCount(store: ReadableStore<{ count: number }>) {
 *   return createEffect(
 *     store,
 *     state => state.count,
 *     count => { console.log('Count:', count); },
 *     {
 *       onError: error => { console.error('Count effect failed:', error); },
 *       fireImmediately: true,
 *     },
 *   );
 * }
 * ```
 */
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
