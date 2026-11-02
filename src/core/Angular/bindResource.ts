import type { Resource, ResourceState } from '../../lib/createResource.js';
import { createReadonlySignal } from './createUseSignal.js';
import type { UseReadonlyState } from './types.js';

export type UseResource<Input, Output> = UseReadonlyState<ResourceState<Output>> & {
  /** Runs the borrowed resource with its original input, options, and result contract. */
  readonly run: Resource<Input, Output>['run'];
};

/**
 * @description Returns a callable binding exposing the borrowed resource's original
 * run function. Calling the binding creates an Angular readonly signal and requires
 * an injection context or an explicit DestroyRef. DestroyRef cleanup unsubscribes
 * that signal without cancelling the borrowed resource; ownership of cancellation
 * and disposal stays with the caller.
 * @param {Resource<Input, Output>} resource - Existing resource to bind.
 * @param {Resource<Input, Output>['store']} resource.store - Readable resource state used to create the signal binding.
 * @param {Resource<Input, Output>['run']} resource.run - Starts a resource run with an input and optional run options, returning its result promise.
 * @param {Resource<Input, Output>['cancel']} resource.cancel - Cancels the resource with an optional reason; not invoked by this binding.
 * @param {Resource<Input, Output>['dispose']} resource.dispose - Disposes the resource; not invoked by this binding.
 * @returns {UseResource<Input, Output>} Readonly state binding with the resource's original run function.
 * - readOnly `UseResource<Input, Output>['readOnly']` - Synchronous snapshot reader with an optional selector; does not create a signal or subscription.
 * - subscribe `UseResource<Input, Output>['subscribe']` - Subscription API supplied by the readonly state binding.
 * - run `Resource<Input, Output>['run']` - Original resource run function.
 * @example
 * ```ts
 * // Inside an Angular injection context, bind an existing resource.
 * const bound = bindResource(resource);
 * const state = bound.readOnly();
 * // This synchronous snapshot read creates no subscription.
 * // Calling bound() creates a signal whose subscription is removed on context destruction.
 * ```
 */
export function bindResource<Input, Output>(resource: Resource<Input, Output>): UseResource<Input, Output> {
  return Object.assign(createReadonlySignal(resource.store), { run: resource.run });
}
