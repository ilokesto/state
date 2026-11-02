import type { Resource, ResourceState } from '../../lib/createResource.js';
import { createReadonlyStore } from './createStore.js';
import type { UseReadonlyState } from './types.js';

export type UseResource<Input, Output> = UseReadonlyState<ResourceState<Output>> & {
  /** Runs the resource with the same input, options, and result contract as the original resource. */
  readonly run: Resource<Input, Output>['run'];
};

/**
 * @description Adapts a resource's state to a read-only Svelte binding and exposes
 * its original run function. Unsubscribing releases the observer, not ownership
 * of the resource; cancellation and disposal remain available on the resource.
 * @param {Resource<Input, Output>} resource - Resource to bind.
 * @param {Resource<Input, Output>['store']} resource.store - Readable store containing the resource state.
 * @param {Resource<Input, Output>['run']} resource.run - Starts a resource run with an input and optional run options, returning its result promise.
 * @param {Resource<Input, Output>['cancel']} resource.cancel - Cancels the resource's active run with an optional reason; not exposed by the binding.
 * @param {Resource<Input, Output>['dispose']} resource.dispose - Disposes the resource; ownership remains with the caller.
 * @returns {UseResource<Input, Output>} Read-only state binding with the original resource runner.
 * - select `UseReadonlyState<ResourceState<Output>>['select']` - Selection API for the resource state.
 * - readOnly `UseReadonlyState<ResourceState<Output>>['readOnly']` - Read-only access to the resource state.
 * - run `Resource<Input, Output>['run']` - Original resource runner, accepting input and optional run options and returning the resource result promise.
 * @example
 * ```ts
 * // searchResource is an existing Resource<string, SearchResult[]>.
 * const search = bindResource(searchResource);
 * const result = await search.run('svelte stores');
 * // Dispose the original resource when its owner is finished with it.
 * searchResource.dispose();
 * ```
 */
export function bindResource<Input, Output>(resource: Resource<Input, Output>): UseResource<Input, Output> {
  return Object.assign(createReadonlyStore(resource.store), { run: resource.run });
}
