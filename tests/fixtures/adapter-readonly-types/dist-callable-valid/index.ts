import { create as createAngular } from '@ilokesto/state/angular';
import { create as createReact } from '@ilokesto/state/react';
import { create as createSolid } from '@ilokesto/state/solid';
import { create as createSvelte } from '@ilokesto/state/svelte';
import { create as createVue } from '@ilokesto/state/vue';

type CallableState = {
  (): number;
  label: string;
};

declare const initialState: CallableState;

const angular = createAngular<CallableState>(initialState);
angular.readOnly()().toFixed();
angular((state) => state()).state().toFixed();
angular().state()().toFixed();

const react = createReact<CallableState>(initialState);
react.readOnly()().toFixed();
react((state) => state())[0].toFixed();
react()[0]().toFixed();

const solid = createSolid<CallableState>(initialState);
solid.readOnly()().toFixed();
solid((state) => state()).state().toFixed();
solid().state()().toFixed();

const svelte = createSvelte<CallableState>(initialState);
svelte.readOnly()().toFixed();
svelte.select((state) => state()).subscribe((value) => value.toFixed());
svelte.subscribe((state) => {
  state().toFixed();
  state.label.toUpperCase();
});

const vue = createVue<CallableState>(initialState);
vue.readOnly()().toFixed();
vue((state) => state()).state.value.toFixed();
vue().state.value().toFixed();
