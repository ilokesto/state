import type { Resource, ResourceResult, ResourceState } from '../../lib/createResource.js';
import { createReadonlyState } from './createUseState.js';
import type { UseReadonlyState } from './types.js';

export type UseResource<Input, Output> = UseReadonlyState<ResourceState<Output>> & {
  readonly run: Resource<Input, Output>['run'];
  readonly useSuspense: () => Extract<ResourceState<Output>, { status: 'idle' | 'success' }>;
};

/** Borrow a resource; only explicit run calls start work, never rendering. */
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
