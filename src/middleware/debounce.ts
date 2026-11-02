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
export type DebounceControls = {
  /** Controls for flushing, cancelling, and inspecting queued debounced updates. */
  readonly debounce: TimerControls;
};
export type DebounceStore<State> = Store<State> & DebounceControls;

type DebounceCapability = PipeCapability<'@ilokesto/state/debounce-controls', DebounceControls>;
type DebouncePipeMiddleware = PipeableMiddleware<
  PipeAnyMiddleware<readonly [], readonly [DebounceCapability]>,
  PipeMiddlewareMetadata<
    '@ilokesto/state/debounce', readonly [], readonly [DebounceCapability], 'reject', readonly []
  >
>;

/**
 * @description Creates middleware that coalesces updates in a fixed window by
 * default. Opt into `mode: 'quiet'` to restart the wait on each call. Values
 * replace; updater functions accumulate. Controls live on `store.debounce`,
 * independently of `store.persist.flush`. Timer settings are validated when
 * creating the middleware. Applying it throws if the store already has a
 * `debounce` property.
 * @param {number} [wait=300] - Delay in milliseconds used by the debounce window.
 * @param {DebounceOptions} [options={}] - Window and edge behavior.
 * @param {boolean | undefined} [options.leading] - Whether to apply an update
 * immediately at the start of a window; defaults to false.
 * @param {boolean | undefined} [options.trailing] - Whether to apply queued
 * updates at the end of a window; defaults to true.
 * @param {'fixed' | 'quiet' | undefined} [options.mode] - Fixed windows start at
 * the first call; quiet windows restart on each call. Defaults to 'fixed'.
 * @returns {DebouncePipeMiddleware} Middleware that adds debounce controls to
 * the supplied store, with metadata describing its capability and composition
 * constraints.
 * - pipeMiddlewareMetadataBrand `DebouncePipeMiddleware[typeof pipeMiddlewareMetadataBrand]` - Type-level middleware metadata.
 * : pipeMiddlewareMetadataBrand.adds `readonly [DebounceCapability]` - The capability supplied by this middleware.
 * : pipeMiddlewareMetadataBrand.adds.0 `DebounceCapability` - Describes the debounce controls.
 * : pipeMiddlewareMetadataBrand.adds.0.id `'@ilokesto/state/debounce-controls'` - Identifier of the supplied capability.
 * : pipeMiddlewareMetadataBrand.adds.0.shape `DebounceControls` - Store properties supplied by the capability.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.debounce `TimerControls` - Controls for queued debounced updates.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.debounce.flush `TimerControls['flush']` - Immediately applies queued updates, if any.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.debounce.cancel `TimerControls['cancel']` - Discards queued updates and clears the active timer.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.debounce.pending `TimerControls['pending']` - Reports whether an update is pending.
 * : pipeMiddlewareMetadataBrand.adds.0.pipeCapabilityBrand `DebounceCapability[typeof pipeCapabilityBrand]` - Type-level capability brand.
 * : pipeMiddlewareMetadataBrand.after `readonly []` - No explicit preceding middleware constraints.
 * : pipeMiddlewareMetadataBrand.before `readonly []` - No explicit following middleware constraints.
 * : pipeMiddlewareMetadataBrand.conflicts `readonly []` - No explicitly declared conflicting capabilities.
 * : pipeMiddlewareMetadataBrand.duplicate `'reject'` - Rejects duplicate applications during composition.
 * : pipeMiddlewareMetadataBrand.id `'@ilokesto/state/debounce'` - Middleware identity used during composition.
 * : pipeMiddlewareMetadataBrand.requires `readonly []` - No prerequisite capabilities.
 * - pipeStateMismatchKindBrand `DebouncePipeMiddleware[typeof pipeStateMismatchKindBrand]` - Type-level marker used for middleware state compatibility.
 * @example
 * ```ts
 * import type { Store } from '@ilokesto/store';
 *
 * function debounceSearchUpdates(store: Store<string>) {
 *   const middleware = debounce(250, {
 *     mode: 'quiet',
 *     trailing: true,
 *   });
 *   return middleware(store);
 * }
 * ```
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
