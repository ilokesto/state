import type { Resource, ResourceState } from '../../lib/createResource.js';
import { createReadonlyComposable } from './createUseComposable.js';
import type { UseReadonlyState } from './types.js';

/** A readonly resource-state composable with the resource's original run function. */
export type UseResource<Input, Output> = UseReadonlyState<ResourceState<Output>> & {
  /** Starts a resource run with the supplied input and optional run options. */
  readonly run: Resource<Input, Output>['run'];
};

/**
 * @description Binds a borrowed resource's state store to a readonly Vue composable
 * and exposes its original run function. Scope cleanup unsubscribes without
 * cancelling the borrowed resource.
 * @param {Resource<Input, Output>} resource - Existing resource to bind without taking ownership of its lifecycle.
 * @param {Resource<Input, Output>['store']} resource.store - Readable store supplying the resource state.
 * @param {Resource<Input, Output>['run']} resource.run - Run function exposed unchanged on the composable.
 * @param {Resource<Input, Output>['cancel']} resource.cancel - Cancels resource work; not called by this binding's scope cleanup.
 * @param {Resource<Input, Output>['dispose']} resource.dispose - Disposes the resource; ownership remains with the caller.
 * @returns {UseResource<Input, Output>} Readonly state composable augmented with the original run function.
 * - readOnly `UseResource<Input, Output>['readOnly']` - Readonly-state control provided by the underlying composable.
 * - run `Resource<Input, Output>['run']` - Original resource run function, accepting input and optional run options and returning a promise of the resource result.
 * @example
 * ```ts
 * // Bind an existing user-loading resource.
 * declare const userResource: Resource<string, { name: string }>;
 * const useUser = bindResource(userResource);
 * await useUser.run('user-42');
 * ```
 */
export function bindResource<Input, Output>(resource: Resource<Input, Output>): UseResource<Input, Output> {
  return Object.assign(createReadonlyComposable(resource.store), { run: resource.run });
}
