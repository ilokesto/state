import { create as createAngular } from '@ilokesto/state/angular';
import { create as createReact } from '@ilokesto/state/react';
import { create as createSolid } from '@ilokesto/state/solid';
import { create as createSvelte } from '@ilokesto/state/svelte';
import { create as createVue } from '@ilokesto/state/vue';

type State = {
  angularFullResultMutation: number;
  angularReadResultMutation: number;
  angularSelectorMutation: number;
  reactFullResultMutation: number;
  reactReadResultMutation: number;
  reactSelectorMutation: number;
  solidFullResultMutation: number;
  solidReadResultMutation: number;
  solidSelectorMutation: number;
  svelteFullResultMutation: number;
  svelteReadResultMutation: number;
  svelteSelectorMutation: number;
  vueFullResultMutation: number;
  vueReadResultMutation: number;
  vueSelectorMutation: number;
};

const initialState: State = {
  angularFullResultMutation: 0,
  angularReadResultMutation: 0,
  angularSelectorMutation: 0,
  reactFullResultMutation: 0,
  reactReadResultMutation: 0,
  reactSelectorMutation: 0,
  solidFullResultMutation: 0,
  solidReadResultMutation: 0,
  solidSelectorMutation: 0,
  svelteFullResultMutation: 0,
  svelteReadResultMutation: 0,
  svelteSelectorMutation: 0,
  vueFullResultMutation: 0,
  vueReadResultMutation: 0,
  vueSelectorMutation: 0,
};

const angular = createAngular<State>(initialState);
angular((state) => {
  state.angularSelectorMutation = 1;
  return state.angularSelectorMutation;
});
angular.readOnly().angularReadResultMutation = 1;
angular().state().angularFullResultMutation = 1;

const react = createReact<State>(initialState);
react((state) => {
  state.reactSelectorMutation = 1;
  return state.reactSelectorMutation;
});
react.readOnly().reactReadResultMutation = 1;
react()[0].reactFullResultMutation = 1;

const solid = createSolid<State>(initialState);
solid((state) => {
  state.solidSelectorMutation = 1;
  return state.solidSelectorMutation;
});
solid.readOnly().solidReadResultMutation = 1;
solid().state().solidFullResultMutation = 1;

const svelte = createSvelte<State>(initialState);
svelte.select((state) => {
  state.svelteSelectorMutation = 1;
  return state.svelteSelectorMutation;
});
svelte.readOnly().svelteReadResultMutation = 1;
svelte.subscribe((state) => {
  state.svelteFullResultMutation = 1;
});

const vue = createVue<State>(initialState);
vue((state) => {
  state.vueSelectorMutation = 1;
  return state.vueSelectorMutation;
});
vue.readOnly().vueReadResultMutation = 1;
vue().state.value.vueFullResultMutation = 1;
