import type { Store } from '@ilokesto/store';
import { registerStoreCleanup } from '../../lib/storeCleanup.js';
import { isTimerReplay, registerTimerCancellation } from '../../lib/timerReplay.js';

export type TimerControls = {
  /** Commit this timer's queued updates now and reopen its window. */
  readonly flush: () => void;
  /** Discard queued updates and reopen the window without evaluating updaters. */
  readonly cancel: () => void;
  /** Whether this timer has queued updates, excluding a leading-only cooldown. */
  readonly pending: () => boolean;
};

export type TimerOptions = {
  readonly leading?: boolean;
  readonly trailing?: boolean;
};

type TimerSettings = {
  readonly wait: number;
  readonly leading: boolean;
  readonly trailing: boolean;
  readonly mode: 'fixed' | 'quiet';
};

export function validateTimerSettings(settings: TimerSettings): void {
  if (!Number.isFinite(settings.wait) || settings.wait < 0) {
    throw new RangeError('Timer wait must be a finite non-negative number');
  }
  if (typeof settings.leading !== 'boolean' || typeof settings.trailing !== 'boolean' ||
    (!settings.leading && !settings.trailing)) {
    throw new TypeError('Timer requires at least one of leading or trailing');
  }
  if (settings.mode !== 'fixed' && settings.mode !== 'quiet') {
    throw new TypeError('Debounce mode must be fixed or quiet');
  }
}

export function createTimerRuntime<State>(
  store: Store<State>,
  settings: TimerSettings,
): TimerControls {
  type Action = Parameters<Store<State>['setState']>[0];
  type Next = (action: Action) => void;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let updates: Action[] = [];
  let savedNext: Next | undefined;
  let unregister: (() => void) | undefined;
  let cancellation = 0;

  const closeWindow = (): void => {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
    unregister?.();
    unregister = undefined;
  };
  const cancel = (): void => {
    cancellation += 1;
    updates = [];
    savedNext = undefined;
    closeWindow();
  };
  const commit = (batch: Action[], next: Next): void => {
    const generation = cancellation;
    // Keep disposal active while user updaters run, even after the window closes.
    const stop = registerStoreCleanup(store, cancel);
    try {
      let current = store.getState() as State;
      for (const update of batch) {
        current = typeof update === 'function'
          ? (update as (previous: Readonly<State>) => State)(current)
          : update;
        if (generation !== cancellation) return;
      }
      // Wrapping also preserves function-valued state returned by an updater.
      next(() => current);
    } finally {
      stop();
    }
  };
  const flush = (): void => {
    const batch = updates;
    const next = savedNext;
    updates = [];
    savedNext = undefined;
    closeWindow();
    // Detach before evaluating: reentrant updates own a new, independent window.
    if (next !== undefined && batch.length > 0) commit(batch, next);
  };
  const schedule = (): void => {
    timeout = setTimeout(() => {
      timeout = undefined;
      flush();
    }, settings.wait);
    unregister = registerStoreCleanup(store, cancel);
  };

  registerTimerCancellation(store, cancel);
  store.pushMiddleware((action, next) => {
    if (isTimerReplay(store)) {
      next(action);
      return;
    }
    const open = timeout === undefined;
    if (!open && settings.mode === 'quiet') closeWindow();
    if (timeout === undefined) schedule();
    if (open && settings.leading) {
      // Preserve the leading path's lazy updater semantics: downstream
      // middleware may reject it without evaluating the updater.
      next(action);
    } else if (settings.trailing) {
      updates.push(action);
      savedNext = next;
    }
  });

  return Object.freeze({ flush, cancel, pending: () => updates.length > 0 });
}
