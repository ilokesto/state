import type { Resource, ResourceState } from '../../lib/createResource.js';
import { createReadonlyStore } from './createStore.js';
import type { UseReadonlyState } from './types.js';

export type UseResource<Input, Output> = UseReadonlyState<ResourceState<Output>> & {
  readonly run: Resource<Input, Output>['run'];
};

/** Unsubscribing releases the observer, not ownership of the resource. */
export function bindResource<Input, Output>(resource: Resource<Input, Output>): UseResource<Input, Output> {
  return Object.assign(createReadonlyStore(resource.store), { run: resource.run });
}
