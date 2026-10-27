import { create as createAngular } from '../../../../src/core/Angular/index.js';
import { create as createReact } from '../../../../src/core/React/index.js';
import { create as createSolid } from '../../../../src/core/Solid/index.js';
import { create as createSvelte } from '../../../../src/core/Svelte/index.js';
import { create as createVue } from '../../../../src/core/Vue/index.js';

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
