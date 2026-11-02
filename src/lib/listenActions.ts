import type { Unsubscribe } from '@ilokesto/store';

/** Supply an explicit event subscription; reducers are never patched or intercepted. */
export type ActionSource<Action> = {
  /** Registers an action listener and returns a function that removes it. */
  readonly subscribe: (listener: (action: Action) => void) => Unsubscribe;
};

export type EffectCleanup = () => void;
export type EffectContext = {
  /** Aborted before the next action's effect starts or when the listener is disposed. */
  readonly signal: AbortSignal;
  /** Idempotently stops listening, drops queued actions, and invalidates the active effect. */
  readonly dispose: Unsubscribe;
};
export type EffectCallback<Value> = (
  value: Value,
  context: EffectContext,
) => void | EffectCleanup | PromiseLike<void | EffectCleanup>;
export type EffectOptions = {
  /** Receives callback, cleanup, and late async failures. Must not throw. */
  readonly onError: (error: unknown) => void;
};

/**
 * @description Observes actions with serialized synchronous callbacks and explicit
 * cleanup ownership. Actions emitted reentrantly are queued. Before each effect
 * starts, the previous execution's signal is aborted and its available cleanup
 * runs. Async effects are not awaited; cleanup that arrives after its execution
 * has been invalidated runs immediately. Disposal stops the subscription, discards
 * queued actions, and invalidates the active execution.
 * Callback, cleanup, async, and unsubscribe failures are sent to onError.
 * Subscription setup errors propagate to the caller. If onError throws, its
 * failure is rethrown in a microtask.
 * @param {ActionSource<Action>} source - Explicit event subscription source;
 * reducers are never patched or intercepted.
 * @param {(listener: (action: Action) => void) => Unsubscribe} source.subscribe -
 * Registers the action listener and returns its unsubscription function. Actions
 * emitted during registration are queued until registration returns.
 * @param {EffectCallback<Action>} effect - Receives each action and a context
 * containing its abort signal and the listener's dispose function. May return
 * cleanup directly or through a promise-like value.
 * @param {EffectOptions} options - Required error-handling configuration.
 * @param {(error: unknown) => void} options.onError - Receives effect, cleanup,
 * unsubscribe, and late async failures. Must not throw.
 * @returns {Unsubscribe} Idempotent disposal function that unsubscribes, drops
 * queued actions, aborts the active execution, and runs its available cleanup.
 * @example
 * ```ts
 * const listeners = new Set<(action: string) => void>();
 * const stop = listenActions(
 *   {
 *     subscribe(listener) {
 *       listeners.add(listener);
 *       return () => { listeners.delete(listener); };
 *     },
 *   },
 *   (action, { signal }) => {
 *     if (action === 'refresh') {
 *       return fetch('/api/items', { signal })
 *         .then(() => undefined)
 *         .catch((error) => {
 *           if (!signal.aborted) throw error;
 *         });
 *     }
 *   },
 *   { onError: (error) => console.error(error) },
 * );
 *
 * for (const listener of listeners) listener('refresh');
 * stop();
 * ```
 */
export function listenActions<Action>(
  source: ActionSource<Action>,
  effect: EffectCallback<Action>,
  options: EffectOptions,
): Unsubscribe {
  type Execution = {
    /** Controls cancellation of this effect execution. */
    readonly controller: AbortController;
    /** Cleanup retained until this execution is invalidated. */
    cleanup?: EffectCleanup;
  };
  const pending: {
    /** Action awaiting synchronous effect dispatch. */
    readonly action: Action;
  }[] = [];
  let active: Execution | undefined;
  let unsubscribe: Unsubscribe | undefined;
  let disposed = false;
  let draining = false;
  let subscribed = false;

  const report = (error: unknown): void => {
    const wasDraining = draining;
    draining = true;
    try {
      options.onError(error);
    } catch (reportError) {
      // An error reporter failure must not create an unobserved promise rejection.
      queueMicrotask(() => { throw reportError; });
    } finally {
      draining = wasDraining;
      drain();
    }
  };

  const cleanup = (callback: EffectCleanup): void => {
    try {
      // A void-typed callback can still return a promise in TypeScript.
      // Observe its rejection without delaying the synchronous cleanup contract.
      Promise.resolve(callback()).then(undefined, report);
    } catch (error) {
      report(error);
    }
  };

  const invalidate = (): void => {
    const execution = active;
    active = undefined;
    if (execution) {
      execution.controller.abort();
      if (execution.cleanup) {
        cleanup(execution.cleanup);
      }
    }
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    pending.length = 0;
    try {
      unsubscribe?.();
    } catch (error) {
      report(error);
    } finally {
      invalidate();
    }
  };

  const acceptCleanup = (execution: Execution, callback: void | EffectCleanup): void => {
    if (typeof callback !== 'function') {
      return;
    }
    if (active === execution) {
      execution.cleanup = callback;
    } else {
      const wasDraining = draining;
      draining = true;
      try {
        cleanup(callback);
      } finally {
        draining = wasDraining;
        drain();
      }
    }
  };

  const drain = (): void => {
    if (draining || !subscribed) {
      return;
    }
    draining = true;
    try {
      while (!disposed && pending.length > 0) {
        const entry = pending.shift();
        if (entry === undefined) {
          break;
        }
        invalidate();
        if (disposed) {
          break;
        }
        const execution: Execution = { controller: new AbortController() };
        active = execution;
        try {
          const result = effect(entry.action, { signal: execution.controller.signal, dispose });
          if (typeof result === 'function' || result === undefined) {
            acceptCleanup(execution, result);
          } else {
            Promise.resolve(result).then(
              (callback) => acceptCleanup(execution, callback),
              report,
            );
          }
        } catch (error) {
          report(error);
        }
      }
    } finally {
      draining = false;
    }
  };

  unsubscribe = source.subscribe((action) => {
    if (!disposed) {
      pending.push({ action });
      drain();
    }
  });
  subscribed = true;
  drain();
  return dispose;
}
