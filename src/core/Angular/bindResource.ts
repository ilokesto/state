import type { Resource, ResourceState } from '../../lib/createResource.js';
import { createReadonlySignal } from './createUseSignal.js';
import type { UseReadonlyState } from './types.js';

export type UseResource<Input, Output> = UseReadonlyState<ResourceState<Output>> & {
  readonly run: Resource<Input, Output>['run'];
};

/** DestroyRef cleanup unsubscribes without cancelling the borrowed resource. */
export function bindResource<Input, Output>(resource: Resource<Input, Output>): UseResource<Input, Output> {
  return Object.assign(createReadonlySignal(resource.store), { run: resource.run });
}
