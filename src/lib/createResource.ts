import { createStore } from '@ilokesto/store';
import type { ReadableStore } from '@ilokesto/store';

/** Observable state of the latest resource execution. */
export type ResourceState<T> =
  | {
      /** No execution is active; also used after explicit cancellation. */
      readonly status: 'idle'
    }
  | {
      /** The latest execution is awaiting an outcome. */
      readonly status: 'pending'
    }
  | {
      /** The latest execution completed successfully. */
      readonly status: 'success';
      /** Value produced by the task. */
      readonly data: T
    }
  | {
      /** The latest execution failed. */
      readonly status: 'error';
      /** Task failure or store notification error. */
      readonly error: unknown
    };

/** Runs resolve an outcome, including cancellation, instead of rejecting. */
export type ResourceResult<T> =
  | {
      /** The execution completed successfully. */
      readonly status: 'success';
      /** Value produced by the task. */
      readonly data: T
    }
  | {
      /** The execution failed, including errors from store notification. */
      readonly status: 'error';
      /** Task failure or store notification error. */
      readonly error: unknown
    }
  | {
      /** The execution was cancelled, superseded, or prevented from starting. */
      readonly status: 'cancelled';
      /** Supplied abort reason or an automatically created AbortError. */
      readonly reason: unknown
    };

/** Cooperative cancellation context supplied to each task invocation. */
export type ResourceContext = {
  /** Aborted when this execution is cancelled, superseded, or disposed. */
  readonly signal: AbortSignal
};
/** Optional cancellation control for an individual run. */
export type ResourceRunOptions = {
  /** Cancels the run when aborted; an already-aborted signal prevents task invocation. */
  readonly signal?: AbortSignal
};
/** Work that can return synchronously or asynchronously and observe cancellation. */
export type ResourceTask<Input, Output> = (
  input: Input,
  context: ResourceContext,
) => Output | PromiseLike<Output>;

/** A latest-wins task runner and its observable state. */
export type Resource<Input, Output> = {
  /** Read-only state, initially idle; stale task completions cannot update it. */
  readonly store: ReadableStore<ResourceState<Output>>;
  /**
   * Starts work with the supplied input, cancelling any previous active run.
   * Resolves to a success, error, or cancellation outcome. A disposed resource
   * or an already-aborted options signal produces cancellation without starting work.
   */
  readonly run: (input: Input, options?: ResourceRunOptions) => Promise<ResourceResult<Output>>;
  /**
   * Cancels the active execution and restores idle state unless an abort callback
   * starts another run. Does nothing when no execution is active.
   * Uses an AbortError when no reason is supplied.
   */
  readonly cancel: (reason?: unknown) => void;
  /** Permanently prevents new work and cancels active work; repeated calls do nothing. */
  readonly dispose: () => void;
};

/**
 * @description Own one latest-wins async action without changing synchronous reducer
 * dispatch. Creates an initially idle store and invokes the task only when run is
 * called. Starting another run aborts the previous execution and resolves it as
 * cancelled; stale completions cannot overwrite current state. Cancellation is
 * cooperative: tasks must observe their context signal to stop underlying work.
 * Task failures become error outcomes rather than rejected run promises.
 * @param {ResourceTask<Input, Output>} task - Work invoked with the run input and a
 * context containing the execution's AbortSignal; may return a value or a promise-like value.
 * @returns {Resource<Input, Output>} The resource's observable state and execution controls.
 * - store `ReadableStore<ResourceState<Output>>` - Read-only state, initially idle,
 * then pending, success, or error; cancellation normally restores idle.
 * - run `(input: Input, options?: ResourceRunOptions) => Promise<ResourceResult<Output>>` - Starts
 * the latest execution, supersedes active work, and resolves its success, error, or
 * cancellation outcome. An optional signal can prevent or cancel this run.
 * - cancel `(reason?: unknown) => void` - Cancels active work with the supplied reason
 * or a default AbortError; does nothing when no execution is active.
 * - dispose `() => void` - Idempotently cancels active work and permanently prevents
 * new task invocations; subsequent runs resolve as cancelled.
 * @example
 * ```ts
 * const profile = createResource(async (userId: string, { signal }) => {
 *   const response = await fetch(`/api/users/${encodeURIComponent(userId)}`, { signal });
 *   if (!response.ok) throw new Error(`Profile request failed: ${response.status}`);
 *   return response.text();
 * });
 *
 * const controller = new AbortController();
 * const result = await profile.run('user-42', { signal: controller.signal });
 * if (result.status === 'success') {
 *   console.log(result.data);
 * }
 * console.log(profile.store.getState());
 * profile.dispose();
 * ```
 */
export function createResource<Input = void, Output = unknown>(
  task: ResourceTask<Input, Output>,
): Resource<Input, Output> {
  const store = createStore<ResourceState<Output>>({ status: 'idle' });
  type Execution = {
    /** Controls the cancellation signal passed to this execution's task. */
    readonly controller: AbortController;
    /** Settles this execution's run promise with its final outcome. */
    readonly resolve: (result: ResourceResult<Output>) => void;
    /** Removes this execution's listener from the caller-provided abort signal. */
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
