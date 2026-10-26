import { createResource } from '@ilokesto/state';
import type { ResourceResult, ResourceState } from '@ilokesto/state';
import { bindResource as react, type UseResource as ReactResource } from '@ilokesto/state/react';
import { bindResource as vue } from '@ilokesto/state/vue';
import { bindResource as solid } from '@ilokesto/state/solid';
import { bindResource as svelte } from '@ilokesto/state/svelte';
import { bindResource as angular } from '@ilokesto/state/angular';
import type { UseResource as SourceReact } from '../../../../src/core/React/index.js';
import type { UseResource as SourceVue } from '../../../../src/core/Vue/index.js';
import type { UseResource as SourceSolid } from '../../../../src/core/Solid/index.js';
import type { UseResource as SourceSvelte } from '../../../../src/core/Svelte/index.js';
import type { UseResource as SourceAngular } from '../../../../src/core/Angular/index.js';
import type { ComputedRef } from 'vue';
import type { Accessor } from 'solid-js';
import type { Signal } from '@angular/core';
import type { Readable } from 'svelte/store';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
const resource = createResource((input: { id: number }) => String(input.id));
const useReact = react(resource);
const useVue = vue(resource);
const useSolid = solid(resource);
const useAngular = angular(resource);
const svelteResource = svelte(resource);

type ReactSourceParity = Assert<Equal<typeof useReact, SourceReact<{ id: number }, string>>>;
type VueSourceParity = Assert<Equal<typeof useVue, SourceVue<{ id: number }, string>>>;
type SolidSourceParity = Assert<Equal<typeof useSolid, SourceSolid<{ id: number }, string>>>;
type SvelteSourceParity = Assert<Equal<typeof svelteResource, SourceSvelte<{ id: number }, string>>>;
type AngularSourceParity = Assert<Equal<typeof useAngular, SourceAngular<{ id: number }, string>>>;
type Input = Assert<Equal<Parameters<typeof useReact.run>[0], { id: number }>>;
type Outcome = Assert<Equal<ReturnType<typeof useVue.run>, Promise<ResourceResult<string>>>>;
type Suspense = Assert<Equal<ReturnType<typeof useReact.useSuspense>, { readonly status: 'idle' } | { readonly status: 'success'; readonly data: string }>>;
type NoWriter = Assert<Equal<Extract<keyof typeof useReact, 'setState' | 'cancel' | 'dispose'>, never>>;
type NoVueSuspense = Assert<Equal<Extract<keyof typeof useVue, 'useSuspense'>, never>>;

function consumers() {
  const reactState: ResourceState<string> = useReact();
  const vueState: ComputedRef<ResourceState<string>> = useVue().state;
  const solidState: Accessor<ResourceState<string>> = useSolid().state;
  const angularState: Signal<ResourceState<string>> = useAngular().state;
  const svelteState: Readable<ResourceState<string>> = svelteResource;
  const selected: ComputedRef<boolean> = useVue(state => state.status === 'pending').state;
  const publicType: ReactResource<{ id: number }, string> = useReact;
  const outcome: Promise<ResourceResult<string>> = publicType.run({ id: 1 }, { signal: new AbortController().signal });
  const suspended = useReact.useSuspense();
  if (suspended.status === 'success') {
    const data: string = suspended.data;
    return data;
  }
  return { reactState, vueState, solidState, angularState, svelteState, selected, outcome };
}

const voidResource = react(createResource(() => 1));
voidResource.run();
void consumers;
