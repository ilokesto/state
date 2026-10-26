import type { Store } from '@ilokesto/store';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeAnyMiddleware, PipeCapability, PipeMiddlewareMetadata } from '../utils/pipe/types.js';
import { createTimerRuntime, validateTimerSettings } from './timer/createTimerRuntime.js';
import type { TimerControls, TimerOptions } from './timer/createTimerRuntime.js';

export type DebounceOptions = TimerOptions & {
  /** Fixed windows start at the first call (default); quiet windows restart on each call. */
  readonly mode?: 'fixed' | 'quiet';
};
export type DebounceControls = { readonly debounce: TimerControls };
export type DebounceStore<State> = Store<State> & DebounceControls;

type DebounceCapability = PipeCapability<'@ilokesto/state/debounce-controls', DebounceControls>;
type DebouncePipeMiddleware = PipeableMiddleware<
  PipeAnyMiddleware<readonly [], readonly [DebounceCapability]>,
  PipeMiddlewareMetadata<
    '@ilokesto/state/debounce', readonly [], readonly [DebounceCapability], 'reject', readonly []
  >
>;

/**
 * Coalesce updates in a fixed window by default. Opt into `mode: 'quiet'` to
 * restart the wait on each call. Values replace; updater functions accumulate.
 * Controls live on `store.debounce`, independently of `store.persist.flush`.
 */
export function debounce(wait = 300, options: DebounceOptions = {}): DebouncePipeMiddleware {
  const settings = {
    wait, mode: options.mode ?? 'fixed',
    leading: options.leading ?? false, trailing: options.trailing ?? true,
  };
  validateTimerSettings(settings);
  const middleware: PipeAnyMiddleware<readonly [], readonly [DebounceCapability]> = <State>(store: Store<State>) => {
    if ('debounce' in store) throw new TypeError('Debounce control conflicts with an existing Store property');
    Object.defineProperty(store, 'debounce', {
      configurable: false, enumerable: true, writable: false,
      value: createTimerRuntime(store, settings),
    });
    return store as DebounceStore<State>;
  };
  const capability: DebounceCapability = {
    id: '@ilokesto/state/debounce-controls',
    shape: { debounce: { flush: () => undefined, cancel: () => undefined, pending: () => false } },
  };
  return definePipeableMiddleware(middleware, {
    adds: [capability], after: [], before: [], conflicts: [],
    duplicate: 'reject', id: '@ilokesto/state/debounce', requires: [],
  } as const);
}
