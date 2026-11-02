import type { Resource, ResourceState } from '../../lib/createResource.js';
import { createReadonlyAccessor } from './createUseAccessor.js';
import type { UseReadonlyState } from './types.js';

export type UseResource<Input, Output> = UseReadonlyState<ResourceState<Output>> & {
  /** Runs the borrowed resource with its original input, options, and result contract. */
  readonly run: Resource<Input, Output>['run'];
};

/**
 * @description Returns a callable binding for a borrowed resource's state
 * and exposes its original run function. Calling the binding inside a Solid
 * reactive owner returns { state }, a readonly reactive accessor. Owner cleanup
 * unsubscribes without cancelling the borrowed resource.
 * @param {Resource<Input, Output>} resource - Resource to observe without taking ownership of its lifecycle.
 * @param {Resource<Input, Output>['store']} resource.store - Readable store containing the resource's current state.
 * @param {Resource<Input, Output>['run']} resource.run - Starts a resource run with an input and optional run settings.
 * @param {Resource<Input, Output>['cancel']} resource.cancel - Cancels the resource's active run; not invoked by this binding.
 * @param {Resource<Input, Output>['dispose']} resource.dispose - Disposes the resource; not invoked by this binding.
 * @returns {UseResource<Input, Output>} Readonly state access and the original resource runner.
 * - readOnly `UseResource<Input, Output>['readOnly']` - Synchronous readonly snapshot reader for the resource state.
 * - run `Resource<Input, Output>['run']` - Original resource runner, preserving its input, options, and promise result.
 * @example
 * ```ts
 * function bindUser(resource: Resource<string, { name: string }>) {
 *   const user = bindResource(resource);
 *   void user.run('user:42');
 *   return user;
 * }
 * ```
 */
export function bindResource<Input, Output>(resource: Resource<Input, Output>): UseResource<Input, Output> {
  return Object.assign(createReadonlyAccessor(resource.store), { run: resource.run });
}
