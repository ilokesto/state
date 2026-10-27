import { Store } from '@ilokesto/store';
import { createElement, StrictMode } from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { effectScope } from 'vue';
import { createRoot as createSolidRoot } from 'solid-js';
import * as react from '../../../dist/core/React/index.js';
import * as vue from '../../../dist/core/Vue/index.js';
import * as angular from '../../../dist/core/Angular/index.js';
import * as svelte from '../../../dist/core/Svelte/index.js';
import * as solid from '../../../dist/core/Solid/index.js';
import { dispose, persist } from '../../../dist/middleware/index.js';
import { pipe } from '../../../dist/utils/pipe/index.js';
import {
  batch, createStore, derived, focus, createStoreFamily, memoizeSelector,
  trackedDerived, withLifecycle,
} from '../../../dist/index.js';

export function registryComposition(framework) {
  const source = createStore({ count: 1, other: 0 });
  const count = focus(source, value => value.count, (value, count) => ({ ...value, count }));
  const memo = memoizeSelector(value => value * 2);
  const doubled = derived(count, memo);
  let calculations = 0;
  const tracked = trackedDerived(source, value => {
    calculations++;
    return value.count;
  });
  const combined = derived([tracked, doubled], ([count, doubled]) => ({ count, doubled }));
  let active = 0;
  const family = createStoreFamily(() => withLifecycle(combined, ({ onCleanup }) => {
    active++;
    onCleanup(() => active--);
  }));
  const view = family.get('counter');
  const reused = family.get('counter') === view;
  const binding = { react, vue, angular, solid, svelte }[framework].bindReadonly(view);
  let read;
  let cleanup;
  if (framework === 'react') {
    let current;
    function View() {
      current = binding();
      return createElement('output', null, `${current.count}:${current.doubled}`);
    }
    const host = document.createElement('div');
    document.body.append(host);
    const root = createReactRoot(host);
    flushSync(() => root.render(createElement(StrictMode, null, createElement(View))));
    read = () => current;
    cleanup = () => { flushSync(() => root.unmount()); host.remove(); };
  } else if (framework === 'vue') {
    const scope = effectScope();
    const value = scope.run(() => binding());
    read = () => value.state.value;
    cleanup = () => scope.stop();
  } else if (framework === 'angular') {
    const callbacks = [];
    read = binding({ destroyRef: {
      onDestroy(callback) { callbacks.push(callback); return () => {}; },
    } }).state;
    cleanup = () => callbacks.forEach(callback => callback());
  } else if (framework === 'solid') {
    read = createSolidRoot(stop => {
      cleanup = stop;
      return binding().state;
    });
  } else {
    let current;
    cleanup = binding.subscribe(value => { current = value; });
    read = () => current;
  }
  const act = action => framework === 'react' ? flushSync(action) : action();
  const seen = [];
  const stop = view.subscribeSelector(value => value, value => seen.push(value));
  try {
    const initial = read();
    const before = calculations;
    act(() => source.update(value => ({ ...value, other: 1 })));
    const skipped = calculations === before && read() === initial;
    act(() => batch(() => {
      count.update(value => value + 1);
      count.update(value => value + 1);
    }));
    const changed = read();
    const connected = active;
    stop();
    cleanup();
    const remaining = active;
    source.update(value => ({ ...value, count: 9 }));
    const stopped = read().count;
    family.dispose();
    return {
      initial, skipped, changed, seen, connected, remaining, stopped, reused,
      parent: source.getState(), exposed: writers(binding),
    };
  } finally {
    stop();
    cleanup();
    family.dispose();
    combined.dispose();
    tracked.dispose();
    doubled.dispose();
    count.dispose();
    memo.clear();
  }
}

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

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

export async function persistenceLifecycle(framework) {
  const readGate = deferred();
  const writeStarted = deferred();
  const writeGate = deferred();
  let attempts = 0;
  const storage = {
    getItem: () => readGate.promise,
    async setItem() {
      if (++attempts === 1) {
        writeStarted.resolve();
        await writeGate.promise;
        throw new Error('offline');
      }
    },
    async removeItem() {},
  };
  const store = pipe.use(persist({
    key: 'binding', storage: () => storage,
    decode: value => typeof value === 'number' ? value : null,
  })).create(0);
  let active = 0;
  const source = {
    getStatus: store.persist.getStatus,
    subscribe(listener) {
      active++;
      const stop = store.persist.subscribe(listener);
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        active--;
        stop();
      };
    },
  };
  const adapter = { react, vue, angular, solid, svelte }[framework].bindPersistStatus(source);
  const eager = active;
  const select = status => ({ nested: { saving: status.saving } });
  const equal = (previous, next) => previous.nested.saving === next.nested.saving;
  let read;
  let readSelected;
  let cleanup;
  let selected;
  let current;
  let host;
  if (framework === 'react') {
    function View() {
      current = adapter();
      selected = adapter(select, equal);
      return createElement('output', null, current.hydration + ':' + current.saving);
    }
    host = document.createElement('div');
    document.body.append(host);
    const root = createReactRoot(host);
    flushSync(() => root.render(createElement(StrictMode, null, createElement(View))));
    read = () => current;
    readSelected = () => selected;
    cleanup = () => { flushSync(() => root.unmount()); host.remove(); };
  } else if (framework === 'vue') {
    const scope = effectScope();
    const results = scope.run(() => [adapter(), adapter(select, equal)]);
    read = () => results[0].state.value;
    readSelected = () => results[1].state.value;
    cleanup = () => scope.stop();
  } else if (framework === 'solid') {
    const results = createSolidRoot(stop => {
      cleanup = stop;
      return [adapter(), adapter(select, equal)];
    });
    read = results[0].state;
    readSelected = results[1].state;
  } else if (framework === 'angular') {
    const callbacks = [];
    const destroyRef = { onDestroy(callback) { callbacks.push(callback); return () => {}; } };
    read = adapter({ destroyRef }).state;
    readSelected = adapter(select, equal, { destroyRef }).state;
    cleanup = () => callbacks.forEach(callback => callback());
  } else {
    const stops = [
      adapter.subscribe(next => { current = next; }),
      adapter.select(select, equal).subscribe(next => { selected = next; }),
    ];
    read = () => current;
    readSelected = () => selected;
    cleanup = () => stops.forEach(stop => stop());
  }
  const sync = () => { if (framework === 'react') flushSync(() => {}); };
  const act = callback => framework === 'react' ? flushSync(callback) : callback();
  const snapshots = [];
  const capture = () => {
    sync();
    const status = read();
    snapshots.push({
      hydration: status.hydration, saving: status.saving, pending: status.pending,
      paused: status.paused, error: status.error?.code ?? null,
    });
  };
  try {
    capture();
    let hydration;
    act(() => { hydration = store.persist.rehydrate(); });
    capture();
    readGate.resolve(null);
    await hydration;
    capture();
    const before = readSelected();
    act(() => store.persist.pause());
    const equalSelection = before === readSelected();
    act(() => store.set(1));
    capture();
    let failed;
    act(() => { failed = store.persist.retry().catch(error => error.code); });
    await writeStarted.promise;
    capture();
    const text = host?.textContent;
    writeGate.resolve();
    const failure = await failed;
    capture();
    await store.persist.retry();
    capture();
    act(() => store.persist.resume());
    capture();
    const subscriptions = active;
    const stoppedSnapshot = read();
    cleanup();
    store.persist.pause();
    store.set(2);
    const stopped = read() === stoppedSnapshot;
    const freshRead = adapter.readOnly().pending;
    await store.persist.flush();
    return {
      eager, subscriptions, remaining: active, stopped, freshRead, equalSelection, failure,
      disposed: store.persist.getStatus().disposed, snapshots,
      text: text ?? null, exposed: writers(adapter),
    };
  } finally {
    cleanup();
    dispose(store);
  }
}
