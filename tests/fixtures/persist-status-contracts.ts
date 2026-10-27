import type { DestroyRef, Signal } from '@angular/core';
import type { PersistControls, PersistStatus } from '@ilokesto/state/middleware';
import { bindPersistStatus as react } from '@ilokesto/state/react';
import { bindPersistStatus as vue } from '@ilokesto/state/vue';
import { bindPersistStatus as angular } from '@ilokesto/state/angular';
import { bindPersistStatus as solid } from '@ilokesto/state/solid';
import { bindPersistStatus as svelte } from '@ilokesto/state/svelte';
import type { Accessor } from 'solid-js';
import type { Readable } from 'svelte/store';
import type { ComputedRef } from 'vue';

declare const persist: PersistControls;
declare const destroyRef: DestroyRef;
const select = (status: PersistStatus) => ({ nested: { saving: status.saving } });
const equal = (previous: ReturnType<typeof select>, next: ReturnType<typeof select>) =>
  previous.nested.saving === next.nested.saving;
const reactBinding = react(persist);
const vueBinding = vue(persist);
const angularBinding = angular(persist);
const solidBinding = solid(persist);
const svelteBinding = svelte(persist);
const selectedReact: ReturnType<typeof select> = reactBinding(select, equal);
const selectedVue: ComputedRef<ReturnType<typeof select>> = vueBinding(select, equal).state;
const selectedAngular: Signal<ReturnType<typeof select>> = angularBinding(select, equal, { destroyRef }).state;
const selectedSolid: Accessor<ReturnType<typeof select>> = solidBinding(select, equal).state;
const selectedSvelte: Readable<ReturnType<typeof select>> = svelteBinding.select(select, equal);
const fullReact: Readonly<PersistStatus> = reactBinding();
const fullVue: ComputedRef<Readonly<PersistStatus>> = vueBinding().state;
const fullAngular: Signal<Readonly<PersistStatus>> = angularBinding({ destroyRef }).state;
const fullSolid: Accessor<Readonly<PersistStatus>> = solidBinding().state;
const fullSvelte: Readable<Readonly<PersistStatus>> = svelteBinding;
type Assert<Condition extends true> = Condition;
type NoWriter<Binding> = Extract<'writeOnly' | 'set' | 'setState' | 'update' | 'dispatch', keyof Binding> extends never ? true : false;
export type ReadonlyBindings = [
  Assert<NoWriter<typeof reactBinding>>, Assert<NoWriter<typeof vueBinding>>,
  Assert<NoWriter<typeof angularBinding>>, Assert<NoWriter<typeof solidBinding>>,
  Assert<NoWriter<typeof svelteBinding>>,
];
export {
  selectedReact, selectedVue, selectedAngular, selectedSolid, selectedSvelte,
  fullReact, fullVue, fullAngular, fullSolid, fullSvelte,
};
