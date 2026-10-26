import type { Resource, ResourceState } from '../../lib/createResource.js';
import { createReadonlyComposable } from './createUseComposable.js';
import type { UseReadonlyState } from './types.js';

export type UseResource<Input, Output> = UseReadonlyState<ResourceState<Output>> & {
  readonly run: Resource<Input, Output>['run'];
};

/** Scope cleanup unsubscribes without cancelling the borrowed resource. */
export function bindResource<Input, Output>(resource: Resource<Input, Output>): UseResource<Input, Output> {
  return Object.assign(createReadonlyComposable(resource.store), { run: resource.run });
}
