import { debounce, history, throttle } from '../../../src/middleware';
import { Store } from '@ilokesto/store';
import type {
  DebounceControls, DebounceOptions, DebounceStore,
  ThrottleControls, ThrottleOptions, ThrottleStore, TimerControls,
} from '../../../src/middleware';
import { pipe } from '../../../src/utils/pipe';

const debounceOptions: DebounceOptions = { mode: 'quiet', leading: true, trailing: true };
const throttleOptions: ThrottleOptions = { leading: false, trailing: true };
const debounced: DebounceStore<number> = debounce(10, debounceOptions)(new Store(0));
const throttled: ThrottleStore<number> = throttle(10, throttleOptions)(new Store(0));
const debounceControls: DebounceControls = debounced;
const throttleControls: ThrottleControls = throttled;
const controls: TimerControls = debounceControls.debounce;
const pending: boolean = controls.pending();
const flush: void = throttleControls.throttle.flush();
const cancel: void = controls.cancel();
const store = pipe.use(history()).use(debounce(10)).use(throttle(10)).create({ count: 0 });
store.undo();
store.debounce.flush();
store.throttle.cancel();
const state: Readonly<{ count: number }> = store.getState();
const reversed = pipe.use(throttle(10)).use(debounce(10)).use(history()).create({ count: 0 });
reversed.redo();
const beforeProvider = pipe.use(history()).create({ count: 0 });
const hasNoControlsBeforeProvider: 'debounce' extends keyof typeof beforeProvider ? true : false = false;
type AcceptsUnknownMode = { mode: 'unknown' } extends DebounceOptions ? true : false;
const acceptsUnknownMode: AcceptsUnknownMode = false;
type HasReadonlyFlush = TimerControls extends { flush: () => number } ? true : false;
const returnsValue: HasReadonlyFlush = false;
void [pending, flush, cancel, state, hasNoControlsBeforeProvider, acceptsUnknownMode, returnsValue];
