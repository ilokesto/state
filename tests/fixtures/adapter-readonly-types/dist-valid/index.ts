import { create as createAngular } from '@ilokesto/state/angular';
import { create as createReact } from '@ilokesto/state/react';
import { create as createSolid } from '@ilokesto/state/solid';
import { create as createSvelte } from '@ilokesto/state/svelte';
import { create as createVue } from '@ilokesto/state/vue';

type State = {
  angular: number;
  react: number;
  solid: number;
  svelte: number;
  vue: number;
};

const initialState: State = { angular: 0, react: 0, solid: 0, svelte: 0, vue: 0 };

const angular = createAngular<State>(initialState);
const angularSelection = angular((state) => state.angular).state;
angularSelection().toFixed();
angular.readOnly().angular.toFixed();
const angularFullResult = angular();
angularFullResult.state().angular.toFixed();
angularFullResult.setState((state) => ({ ...state, angular: state.angular + 1 }));

const react = createReact<State>(initialState);
const [reactSelection] = react((state) => state.react);
reactSelection.toFixed();
react.readOnly().react.toFixed();
const [reactFullState, reactSetState] = react();
reactFullState.react.toFixed();
reactSetState((state) => ({ ...state, react: state.react + 1 }));

const solid = createSolid<State>(initialState);
const solidSelection = solid((state) => state.solid).state;
solidSelection().toFixed();
solid.readOnly().solid.toFixed();
const solidFullResult = solid();
solidFullResult.state().solid.toFixed();
solidFullResult.setState((state) => ({ ...state, solid: state.solid + 1 }));

const svelte = createSvelte<State>(initialState);
svelte.select((state) => state.svelte);
svelte.readOnly().svelte.toFixed();
svelte.subscribe((state) => state.svelte.toFixed());
svelte.setState((state) => ({ ...state, svelte: state.svelte + 1 }));

const vue = createVue<State>(initialState);
const vueSelection = vue((state) => state.vue).state;
vueSelection.value.toFixed();
vue.readOnly().vue.toFixed();
const vueFullResult = vue();
vueFullResult.state.value.vue.toFixed();
vueFullResult.setState((state) => ({ ...state, vue: state.vue + 1 }));
