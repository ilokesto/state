import type { Resource, ResourceResult, ResourceState } from '../../lib/createResource.js';
import { createReadonlyState } from './createUseState.js';
import type { UseReadonlyState } from './types.js';

export type UseResource<Input, Output> = UseReadonlyState<ResourceState<Output>> & {
  readonly run: Resource<Input, Output>['run'];
  readonly useSuspense: () => Extract<ResourceState<Output>, { status: 'idle' | 'success' }>;
};

/**
 * @description Borrows a resource as a readonly React state hook. Rendering never
 * starts work; only explicit run calls do. The binding does not own the resource
 * and does not automatically cancel or dispose it.
 * @param {Resource<Input, Output>} resource - Resource to observe and run.
 * @param {ReadableStore<ResourceState<Output>>} resource.store - Store supplying resource state snapshots and subscriptions.
 * @param {Resource<Input, Output>['run']} resource.run - Starts resource work. An already-aborted signal is delegated directly without replacing the binding's tracked execution.
 * @param {(reason?: unknown) => void} resource.cancel - Cancels resource work; call explicitly when needed.
 * @param {() => void} resource.dispose - Disposes the resource; call explicitly when ownership ends.
 * @returns {UseResource<Input, Output>} Callable readonly state hook with resource controls.
 * - readOnly `UseReadonlyState<ResourceState<Output>>['readOnly']` - Reads the current snapshot or a selected value without subscribing.
 * - run `Resource<Input, Output>['run']` - Starts work and tracks its promise for Suspense, installing tracking before pending state is published. Resolves with the resource result.
 * - useSuspense `() => Extract<ResourceState<Output>, { status: 'idle' | 'success' }>` - Reads reactive state, returning idle or success snapshots, including idle after cancellation or disposal. Throws the stored error for error state. While pending, throws the tracked promise, or an error if work was not started through this binding, has already settled, or its captured snapshot no longer matches the resource store.
 * @example
 * ```tsx
 * const useSearch = bindResource(searchResource);
 *
 * function SearchResults() {
 *   const state = useSearch.useSuspense();
 *   return <pre>{JSON.stringify(state)}</pre>;
 * }
 *
 * // Start work from an event handler, not during rendering.
 * function SearchButton() {
 *   return <button onClick={() => { void useSearch.run('hello'); }}>Search</button>;
 * }
 * // Render SearchResults beneath a React Suspense boundary and an error boundary.
 * ```
 */
export function bindResource<Input, Output>(resource: Resource<Input, Output>): UseResource<Input, Output> {
  const useState = createReadonlyState(resource.store);
  let execution: {
    readonly promise: Promise<ResourceResult<Output>>;
    snapshot?: ResourceState<Output>;
    settled: boolean;
  } | undefined;

  const run: Resource<Input, Output>['run'] = (input, options) => {
    if (options?.signal?.aborted) {
      return resource.run(input, options);
    }
    const { promise, resolve } = Promise.withResolvers<ResourceResult<Output>>();
    const current: NonNullable<typeof execution> = { promise, settled: false };
    execution = current;
    // Install the promise before run publishes pending: subscribers can render synchronously.
    const result = resource.run(input, options);
    current.snapshot = resource.store.getState();
    void result.then(outcome => {
      current.settled = true;
      resolve(outcome);
    });
    return promise;
  };

  function useSuspense() {
    const state = useState();
    if (state.status === 'error') {
      throw state.error;
    }
    if (state.status === 'pending') {
      // No render-time subscription: an abandoned suspended mount owns no listeners.
      if (!execution || execution.settled ||
        (execution.snapshot && execution.snapshot !== resource.store.getState())) {
        throw new Error('[@ilokesto/state/react] useSuspense() requires pending work to start through this binding.run().');
      }
      throw execution.promise;
    }
    // Idle includes cancellation/disposal and must never create an unresolved promise.
    return state;
  }

  return Object.assign(useState, { run, useSuspense });
}
