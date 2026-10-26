import { createStore } from '@ilokesto/store';
import type { ReadableStore } from '@ilokesto/store';

export type ResourceState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: unknown };

/** Runs resolve an outcome, including cancellation, instead of rejecting. */
export type ResourceResult<T> =
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: unknown }
  | { readonly status: 'cancelled'; readonly reason: unknown };

export type ResourceContext = { readonly signal: AbortSignal };
export type ResourceRunOptions = { readonly signal?: AbortSignal };
export type ResourceTask<Input, Output> = (
  input: Input,
  context: ResourceContext,
) => Output | PromiseLike<Output>;

export type Resource<Input, Output> = {
  readonly store: ReadableStore<ResourceState<Output>>;
  readonly run: (input: Input, options?: ResourceRunOptions) => Promise<ResourceResult<Output>>;
  readonly cancel: (reason?: unknown) => void;
  readonly dispose: () => void;
};

/** Own one latest-wins async action without changing synchronous reducer dispatch. */
export function createResource<Input = void, Output = unknown>(
  task: ResourceTask<Input, Output>,
): Resource<Input, Output> {
  const store = createStore<ResourceState<Output>>({ status: 'idle' });
  type Execution = {
    readonly controller: AbortController;
    readonly resolve: (result: ResourceResult<Output>) => void;
    readonly detach: () => void;
  };
  let active: Execution | undefined;
  let generation = 0;
  let disposed = false;

  const abort = (execution: Execution, reason: unknown): void => {
    execution.detach();
    execution.resolve({ status: 'cancelled', reason });
    execution.controller.abort(reason);
  };

  const cancel = (reason: unknown = new DOMException('Resource cancelled', 'AbortError')): void => {
    const execution = active;
    if (!execution) {
      return;
    }
    const cancelledGeneration = ++generation;
    active = undefined;
    abort(execution, reason);
    // Abort callbacks can synchronously start another run.
    if (generation === cancelledGeneration) {
      store.set({ status: 'idle' });
    }
  };

  const finish = (execution: Execution, result: Exclude<ResourceResult<Output>, { status: 'cancelled' }>): void => {
    if (active !== execution) {
      return;
    }
    active = undefined;
    execution.detach();
    try {
      store.set(result);
      execution.resolve(result);
    } catch (error) {
      // The store already committed; surface notification errors to this run's caller.
      execution.resolve({ status: 'error', error });
    }
  };

  return {
    store: {
      getState: () => store.getState(),
      getInitialState: () => store.getInitialState(),
      subscribe: (listener) => store.subscribe(listener),
      subscribeSelector: (selector, listener, equalityFn) =>
        store.subscribeSelector(selector, listener, equalityFn),
    },
    run(input, options = {}) {
      if (disposed || options.signal?.aborted) {
        return Promise.resolve({
          status: 'cancelled',
          reason: options.signal?.aborted
            ? options.signal.reason
            : new DOMException('Resource disposed', 'AbortError'),
        });
      }

      const { promise, resolve } = Promise.withResolvers<ResourceResult<Output>>();
      const previous = active;
      const controller = new AbortController();
      const onAbort = (): void => {
        if (active === execution) {
          cancel(options.signal?.reason);
        }
      };
      const execution: Execution = {
        controller,
        resolve,
        detach: () => options.signal?.removeEventListener('abort', onAbort),
      };
      active = execution;
      generation += 1;
      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (previous) {
        abort(previous, new DOMException('Resource superseded', 'AbortError'));
      }
      if (active !== execution) {
        return promise;
      }

      try {
        store.set({ status: 'pending' });
        if (active === execution) {
          // Attach both handlers even if task() reentrantly cancels this execution.
          Promise.resolve(task(input, { signal: controller.signal })).then(
            (data) => finish(execution, { status: 'success', data }),
            (error: unknown) => finish(execution, { status: 'error', error }),
          );
        }
      } catch (error) {
        finish(execution, { status: 'error', error });
      }
      return promise;
    },
    cancel,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      cancel(new DOMException('Resource disposed', 'AbortError'));
    },
  };
}
