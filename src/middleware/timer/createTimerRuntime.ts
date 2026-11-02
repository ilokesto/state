import type { Store } from '@ilokesto/store';
import { registerStoreCleanup } from '../../lib/storeCleanup.js';
import { isTimerReplay, registerTimerCancellation } from '../../lib/timerReplay.js';

export type TimerControls = {
  /** Commit this timer's queued updates now and close its window. */
  readonly flush: () => void;
  /** Discard queued updates and close the window without evaluating updaters. */
  readonly cancel: () => void;
  /** Whether this timer has queued updates, excluding a leading-only cooldown. */
  readonly pending: () => boolean;
};

export type TimerOptions = {
  /** Whether to forward the first update immediately when a window opens. */
  readonly leading?: boolean;
  /** Whether to queue updates not forwarded on the leading edge for a later commit. */
  readonly trailing?: boolean;
};

type TimerSettings = {
  /** Finite, non-negative window duration in milliseconds. */
  readonly wait: number;
  /** Whether to forward the first update immediately when a window opens. */
  readonly leading: boolean;
  /** Whether to queue updates not forwarded on the leading edge for a later commit. */
  readonly trailing: boolean;
  /** Keep the original deadline with fixed mode, or restart it on each update with quiet mode. */
  readonly mode: 'fixed' | 'quiet';
};

/**
 * @description Validates timer settings without modifying them. Requires a finite,
 * non-negative wait, boolean edge flags with at least one enabled, and a supported mode.
 * @param {TimerSettings} settings - Settings to validate.
 * @param {number} settings.wait - Window duration in milliseconds; must be finite and non-negative.
 * @param {boolean} settings.leading - Whether the first update is forwarded immediately.
 * @param {boolean} settings.trailing - Whether subsequent updates can be queued for a later commit.
 * @param {'fixed' | 'quiet'} settings.mode - Fixed deadline or a deadline restarted by each update.
 * @throws {RangeError} If the wait is not finite or is negative.
 * @throws {TypeError} If the edge flags are invalid, neither edge is enabled, or the mode is unsupported.
 * @example
 * ```ts
 * validateTimerSettings({
 *   wait: 150,
 *   leading: false,
 *   trailing: true,
 *   mode: 'quiet',
 * });
 * ```
 */
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

/**
 * @description Installs timer middleware on a store and returns frozen controls.
 * The leading edge forwards the first update immediately; the trailing edge queues
 * other updates and commits them in order as one downstream update. Fixed mode
 * retains the window's original deadline, while quiet mode restarts it on each update.
 * Queued updaters are evaluated only when committed. Store cleanup cancels pending
 * work, and timer replay bypasses this middleware's scheduling. Settings must already
 * be valid; this function does not validate them.
 * @param {Store<State>} store - Store on which to install the timer middleware.
 * @param {TimerSettings} settings - Validated scheduling and edge settings.
 * @param {number} settings.wait - Finite, non-negative window duration in milliseconds.
 * @param {boolean} settings.leading - Whether to forward the first update of a window immediately.
 * @param {boolean} settings.trailing - Whether to queue updates not forwarded on the leading edge.
 * @param {'fixed' | 'quiet'} settings.mode - Whether to retain or restart the deadline on subsequent updates.
 * @returns {TimerControls} Frozen controls for this timer's queued work and scheduling window.
 * - flush `() => void` - Commits queued updates now and closes the current window, including a leading-only cooldown; does nothing during an active flush.
 * - cancel `() => void` - Discards queued updates without evaluating them and closes the window; also prevents an in-progress batch from committing.
 * - pending `() => boolean` - Reports whether updates are queued, excluding a leading-only cooldown.
 * @example
 * ```ts
 * // Attach a trailing timer to an existing numeric store.
 * const settings = {
 *   wait: 150,
 *   leading: false,
 *   trailing: true,
 *   mode: 'quiet' as const,
 * };
 * validateTimerSettings(settings);
 * const timer = createTimerRuntime(store, settings);
 * store.setState(value => value + 1);
 * if (timer.pending()) {
 *   timer.flush();
 * }
 * ```
 */
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
  let flushing = false;

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
    if (flushing) return;
    const batch = updates;
    const next = savedNext;
    updates = [];
    savedNext = undefined;
    closeWindow();
    // Detach before evaluating: reentrant updates own a new, independent window.
    if (next !== undefined && batch.length > 0) {
      flushing = true;
      try {
        commit(batch, next);
      } finally {
        flushing = false;
      }
    }
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
    if (open && settings.leading && !flushing) {
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
