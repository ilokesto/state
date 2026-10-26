import type { Store } from '@ilokesto/store';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeAnyMiddleware, PipeCapability, PipeMiddlewareMetadata } from '../utils/pipe/types.js';
import { createTimerRuntime, validateTimerSettings } from './timer/createTimerRuntime.js';
import type { TimerControls, TimerOptions } from './timer/createTimerRuntime.js';

export type ThrottleOptions = TimerOptions;
export type ThrottleControls = { readonly throttle: TimerControls };
export type ThrottleStore<State> = Store<State> & ThrottleControls;

type ThrottleCapability = PipeCapability<'@ilokesto/state/throttle-controls', ThrottleControls>;
type ThrottlePipeMiddleware = PipeableMiddleware<
  PipeAnyMiddleware<readonly [], readonly [ThrottleCapability]>,
  PipeMiddlewareMetadata<
    '@ilokesto/state/throttle', readonly [], readonly [ThrottleCapability], 'reject', readonly []
  >
>;

/**
 * Pass the leading update and drop subsequent updates by default. Opt into
 * trailing accumulation with `{ trailing: true }`. Controls live on
 * `store.throttle`; pending reports queued work rather than the cooldown.
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
