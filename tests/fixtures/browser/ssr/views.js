import { createElement, useEffect } from 'react';
import { h } from 'vue';
import { bindReadonly as bindReact } from '../../../../dist/core/React/index.js';
import { bindReadonly as bindVue } from '../../../../dist/core/Vue/index.js';

export function reactView(store, ready) {
  const useCounter = bindReact(store);
  return function Counter({ selector }) {
    const selected = useCounter(selector);
    useEffect(() => { ready?.(); }, []);
    return createElement('output', null, selected);
  };
}

export function vueView(store, selector) {
  return {
    setup() {
      const { state } = bindVue(store)(selector);
      return () => h('output', state.value);
    },
  };
}
