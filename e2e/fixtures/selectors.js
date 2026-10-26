import { Store } from '@ilokesto/store';
import { createElement, StrictMode } from 'react';
import { createRoot as createReactRoot } from '../../website/node_modules/react-dom/client.js';
import { flushSync } from '../../website/node_modules/react-dom/index.js';
import { effectScope } from 'vue';
import { createRoot as createSolidRoot } from 'solid-js';
import * as react from '../../dist/core/React/index.js';
import * as vue from '../../dist/core/Vue/index.js';
import * as angular from '../../dist/core/Angular/index.js';
import * as svelte from '../../dist/core/Svelte/index.js';
import * as solid from '../../dist/core/Solid/index.js';

function source() {
  const backing = new Store({ count: 1, label: 'initial' });
  let active = 0;
  let notifications = 0;
  const readable = {
    getState() { return backing.getState(); },
    getInitialState() { return backing.getInitialState(); },
    subscribe(listener) { return backing.subscribe(listener); },
    subscribeSelector(selector, listener, equality) {
      active++;
      const unsubscribe = backing.subscribeSelector(selector, (next, previous) => {
        notifications++;
        listener(next, previous);
      }, equality);
      return () => { active--; unsubscribe(); };
    },
  };
  const writable = {
    ...readable,
    setState(next) { backing.setState(next); },
    set(next) { backing.set(next); },
    update(updater) { backing.update(updater); },
    pushMiddleware(middleware) { backing.pushMiddleware(middleware); },
    unshiftMiddleware(middleware) { backing.unshiftMiddleware(middleware); },
  };
  return { backing, readable, writable, active: () => active, notifications: () => notifications };
}
const select = state => ({ nested: { count: state.count }, label: state.label });
const equalCount = (previous, next) => previous.nested.count === next.nested.count;
const equalLabel = (previous, next) => previous.label === next.label;
const writers = value => ['set', 'update', 'setState', 'dispatch', 'writeOnly'].filter(key => key in value);

export function scoped(framework) {
  const input = source();
  let value;
  let read;
  let cleanup;
  let adapter;
  if (framework === 'vue') {
    adapter = vue.bindReadonly(input.readable);
    const scope = effectScope();
    value = scope.run(() => adapter(select, equalCount));
    read = () => value.state.value;
    cleanup = () => scope.stop();
  } else if (framework === 'angular') {
    adapter = angular.bindReadonly(input.readable);
    const callbacks = [];
    const destroyRef = { onDestroy(callback) { callbacks.push(callback); return () => {}; } };
    value = adapter(select, equalCount, { destroyRef });
    read = value.state;
    cleanup = () => callbacks.forEach(callback => callback());
  } else if (framework === 'solid') {
    adapter = solid.bindReadonly(input.readable);
    value = createSolidRoot(dispose => {
      cleanup = dispose;
      return adapter(select, equalCount);
    });
    read = value.state;
  } else {
    adapter = svelte.bindReadonly(input.readable);
    value = adapter.select(select, equalCount);
    let current;
    cleanup = value.subscribe(next => { current = next; });
    read = () => current;
  }
  const first = read();
  input.backing.setState(state => ({ ...state, label: 'unrelated' }));
  const stable = read() === first;
  const skipped = input.notifications();
  input.backing.setState(state => ({ ...state, count: 2 }));
  const changed = read().nested.count;
  const active = input.active();
  const exposed = [...writers(adapter), ...writers(value)];
  cleanup();
  input.backing.setState(state => ({ ...state, count: 3 }));
  return { stable, skipped, changed, active, exposed, remaining: input.active(), stopped: read().nested.count, notifications: input.notifications() };
}

export function reactLifecycle(readonly) {
  const input = source();
  const useSelection = readonly ? react.bindReadonly(input.readable) : react.bind(input.writable);
  let current;
  let writer;
  let renders = 0;
  function View({ selector, equality }) {
    const result = useSelection(selector, equality);
    current = readonly ? result : result[0];
    writer = readonly ? undefined : result[1];
    renders++;
    return createElement('output', null, current.nested.count + ':' + current.label);
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createReactRoot(host);
  const render = (selector, equality) => flushSync(() => root.render(createElement(StrictMode, null, createElement(View, { selector, equality }))));
  render(select, equalCount);
  const first = current;
  const firstWriter = writer;
  const initialRenders = renders;
  flushSync(() => input.backing.setState(state => ({ ...state, label: 'unrelated' })));
  const skipped = renders === initialRenders;
  render(select, equalCount);
  const stable = current === first;
  render(select, equalLabel);
  flushSync(() => input.backing.setState(state => ({ ...state, count: 2 })));
  const replacementEquality = current.nested.count === 1;
  flushSync(() => input.backing.setState(state => ({ ...state, label: 'changed' })));
  const label = current.label;
  const replacementSelector = state => ({ nested: { count: state.count * 10 }, label: state.label });
  render(replacementSelector, equalCount);
  const write = readonly ? input.writable.setState : writer;
  flushSync(() => write(state => ({ ...state, count: 3 })));
  const count = current.nested.count;
  const text = host.textContent;
  const stableWriter = writer === firstWriter;
  const active = input.active();
  const exposed = writers(useSelection);
  flushSync(() => root.unmount());
  host.remove();
  return { skipped, stable, replacementEquality, label, count, text, stableWriter, active, remaining: input.active(), exposed };
}
