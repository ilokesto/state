import { create as createAngular } from '../../../../src/core/Angular/index.js';
import { create as createReact } from '../../../../src/core/React/index.js';
import { create as createSolid } from '../../../../src/core/Solid/index.js';
import { create as createSvelte } from '../../../../src/core/Svelte/index.js';
import { create as createVue } from '../../../../src/core/Vue/index.js';

type GenericIdentity = <Value>(value: Value) => Value;
type OverloadedState = {
  (value: number): number;
  (value: string): string;
  label: string;
};

declare const genericIdentity: GenericIdentity;
declare const overloadedState: OverloadedState;

const angularGeneric = createAngular<GenericIdentity>(genericIdentity);
angularGeneric.readOnly()('angular').toUpperCase();
angularGeneric((state) => state(1)).state().toFixed();
angularGeneric().state()({ angular: true }).angular.valueOf();
const angularOverloaded = createAngular<OverloadedState>(overloadedState);
angularOverloaded.readOnly()('angular').toUpperCase();
angularOverloaded((state) => state(1)).state().toFixed();
angularOverloaded().state()('angular').toUpperCase();
angularOverloaded().state().label = 'angular';

const reactGeneric = createReact<GenericIdentity>(genericIdentity);
reactGeneric.readOnly()('react').toUpperCase();
reactGeneric((state) => state(1))[0].toFixed();
reactGeneric()[0]({ react: true }).react.valueOf();
const reactOverloaded = createReact<OverloadedState>(overloadedState);
reactOverloaded.readOnly()('react').toUpperCase();
reactOverloaded((state) => state(1))[0].toFixed();
reactOverloaded()[0]('react').toUpperCase();
reactOverloaded()[0].label = 'react';

const solidGeneric = createSolid<GenericIdentity>(genericIdentity);
solidGeneric.readOnly()('solid').toUpperCase();
solidGeneric((state) => state(1)).state().toFixed();
solidGeneric().state()({ solid: true }).solid.valueOf();
const solidOverloaded = createSolid<OverloadedState>(overloadedState);
solidOverloaded.readOnly()('solid').toUpperCase();
solidOverloaded((state) => state(1)).state().toFixed();
solidOverloaded().state()('solid').toUpperCase();
solidOverloaded().state().label = 'solid';

const svelteGeneric = createSvelte<GenericIdentity>(genericIdentity);
svelteGeneric.readOnly()('svelte').toUpperCase();
svelteGeneric.select((state) => state(1)).subscribe((value) => value.toFixed());
svelteGeneric.subscribe((state) => state({ svelte: true }).svelte.valueOf());
const svelteOverloaded = createSvelte<OverloadedState>(overloadedState);
svelteOverloaded.readOnly()('svelte').toUpperCase();
svelteOverloaded.select((state) => state(1)).subscribe((value) => value.toFixed());
svelteOverloaded.subscribe((state) => {
  state('svelte').toUpperCase();
  state.label = 'svelte';
});

const vueGeneric = createVue<GenericIdentity>(genericIdentity);
vueGeneric.readOnly()('vue').toUpperCase();
vueGeneric((state) => state(1)).state.value.toFixed();
vueGeneric().state.value({ vue: true }).vue.valueOf();
const vueOverloaded = createVue<OverloadedState>(overloadedState);
vueOverloaded.readOnly()('vue').toUpperCase();
vueOverloaded((state) => state(1)).state.value.toFixed();
vueOverloaded().state.value('vue').toUpperCase();
vueOverloaded().state.value.label = 'vue';
