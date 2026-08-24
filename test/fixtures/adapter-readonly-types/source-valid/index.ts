import { create as createAngular } from '../../../../src/core/Angular/index.js';
import { create as createReact } from '../../../../src/core/React/index.js';
import { create as createSolid } from '../../../../src/core/Solid/index.js';
import { create as createSvelte } from '../../../../src/core/Svelte/index.js';
import { create as createVue } from '../../../../src/core/Vue/index.js';

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
