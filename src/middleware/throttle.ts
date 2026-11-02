import type { Store } from '@ilokesto/store';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeAnyMiddleware, PipeCapability, PipeMiddlewareMetadata } from '../utils/pipe/types.js';
import { createTimerRuntime, validateTimerSettings } from './timer/createTimerRuntime.js';
import type { TimerControls, TimerOptions } from './timer/createTimerRuntime.js';

export type ThrottleOptions = TimerOptions;
export type ThrottleControls = {
  /** Controls for flushing, cancelling, and inspecting queued throttled updates. */
  readonly throttle: TimerControls;
};
export type ThrottleStore<State> = Store<State> & ThrottleControls;

type ThrottleCapability = PipeCapability<'@ilokesto/state/throttle-controls', ThrottleControls>;
type ThrottlePipeMiddleware = PipeableMiddleware<
  PipeAnyMiddleware<readonly [], readonly [ThrottleCapability]>,
  PipeMiddlewareMetadata<
    '@ilokesto/state/throttle', readonly [], readonly [ThrottleCapability], 'reject', readonly []
  >
>;

/**
 * @description Creates fixed-window throttle middleware. Pass the leading update
 * and drop subsequent updates by default. Opt into trailing accumulation with
 * `{ trailing: true }`. Controls live on `store.throttle`; pending reports queued
 * work rather than the cooldown. Validates the timer settings immediately.
 * Applying the middleware installs nonconfigurable, enumerable, readonly controls
 * on the supplied store and returns that same store. Throws if the store already
 * has a `throttle` property. Pipe metadata rejects duplicate installations.
 * @param {number} [wait=300] - Throttle window duration in milliseconds.
 * @param {TimerOptions} [options={}] - Leading and trailing update settings.
 * @param {boolean | undefined} [options.leading=true] - Whether to apply the
 * leading update immediately.
 * @param {boolean | undefined} [options.trailing=false] - Whether to accumulate
 * suppressed updates for application at the end of the window.
 * @returns {ThrottlePipeMiddleware} Middleware that installs throttle controls,
 * together with metadata describing its capability and composition constraints.
 * - pipeMiddlewareMetadataBrand `ThrottlePipeMiddleware[typeof pipeMiddlewareMetadataBrand]` - Type-level pipe composition metadata; runtime metadata is registered separately.
 * : pipeMiddlewareMetadataBrand.adds `readonly [ThrottleCapability]` - Capability supplied by this middleware.
 * : pipeMiddlewareMetadataBrand.adds.0 `ThrottleCapability` - Descriptor for the throttle controls capability.
 * : pipeMiddlewareMetadataBrand.adds.0.id `'@ilokesto/state/throttle-controls'` - Stable capability identifier.
 * : pipeMiddlewareMetadataBrand.adds.0.shape `ThrottleControls` - Store fields supplied by this capability.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.throttle `TimerControls` - Shape of the installed timer controls.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.throttle.flush `TimerControls['flush']` - Control that immediately applies queued work when available.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.throttle.cancel `TimerControls['cancel']` - Control that cancels scheduled work and discards queued updates.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.throttle.pending `TimerControls['pending']` - Control that reports queued work, not merely an active cooldown.
 * : pipeMiddlewareMetadataBrand.adds.0.pipeCapabilityBrand `ThrottleCapability[typeof pipeCapabilityBrand]` - Type-level brand identifying a pipe capability.
 * : pipeMiddlewareMetadataBrand.after `readonly []` - No explicit ordering requirements after other middleware.
 * : pipeMiddlewareMetadataBrand.before `readonly []` - No explicit ordering requirements before other middleware.
 * : pipeMiddlewareMetadataBrand.conflicts `readonly []` - No explicitly declared conflicting capability identifiers.
 * : pipeMiddlewareMetadataBrand.duplicate `'reject'` - Rejects duplicate middleware composition.
 * : pipeMiddlewareMetadataBrand.id `'@ilokesto/state/throttle'` - Stable middleware identifier.
 * : pipeMiddlewareMetadataBrand.requires `readonly []` - Requires no capabilities from preceding middleware.
 * - pipeStateMismatchKindBrand `ThrottlePipeMiddleware[typeof pipeStateMismatchKindBrand]` - Type-level marker used by pipe state compatibility checking.
 * @example
 * ```ts
 * // Given an existing Store<number>, enable leading and trailing updates.
 * declare const store: Store<number>;
 * const throttledStore = throttle(250, { trailing: true })(store);
 *
 * // Apply queued updates immediately, for example before submitting a form.
 * if (throttledStore.throttle.pending()) {
 *   throttledStore.throttle.flush();
 * }
 * ```
 */
export function throttle(wait = 300, options: ThrottleOptions = {}): ThrottlePipeMiddleware {
  const settings = {
    wait, mode: 'fixed' as const,
    leading: options.leading ?? true, trailing: options.trailing ?? false,
  };
  validateTimerSettings(settings);
  const middleware: PipeAnyMiddleware<readonly [], readonly [ThrottleCapability]> = <State>(store: Store<State>) => {
    if ('throttle' in store) throw new TypeError('Throttle control conflicts with an existing Store property');
    Object.defineProperty(store, 'throttle', {
      configurable: false, enumerable: true, writable: false,
      value: createTimerRuntime(store, settings),
    });
    return store as ThrottleStore<State>;
  };
  const capability: ThrottleCapability = {
    id: '@ilokesto/state/throttle-controls',
    shape: { throttle: { flush: () => undefined, cancel: () => undefined, pending: () => false } },
  };
  return definePipeableMiddleware(middleware, {
    adds: [capability], after: [], before: [], conflicts: [],
    duplicate: 'reject', id: '@ilokesto/state/throttle', requires: [],
  } as const);
}
