import type { Unsubscribe } from '@ilokesto/store';

/** Supply an explicit event subscription; reducers are never patched or intercepted. */
export type ActionSource<Action> = {
  readonly subscribe: (listener: (action: Action) => void) => Unsubscribe;
};

export type EffectCleanup = () => void;
export type EffectContext = {
  readonly signal: AbortSignal;
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

/** Observe actions with serialized synchronous callbacks and explicit cleanup ownership. */
export function listenActions<Action>(
  source: ActionSource<Action>,
  effect: EffectCallback<Action>,
  options: EffectOptions,
): Unsubscribe {
  type Execution = {
    readonly controller: AbortController;
    cleanup?: EffectCleanup;
  };
  const pending: { readonly action: Action }[] = [];
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
