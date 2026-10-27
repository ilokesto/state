import { act, Component, createElement, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createApp, h, nextTick } from 'vue';
import { createRenderEffect } from 'solid-js';
import { render } from 'solid-js/web';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { mount, tick, unmount } from 'svelte';
import ResourceView from './ResourceView.svelte';
import { createResource } from '../../dist/index.js';
import * as react from '../../dist/core/React/index.js';
import * as vue from '../../dist/core/Vue/index.js';
import * as angular from '../../dist/core/Angular/index.js';
import * as svelte from '../../dist/core/Svelte/index.js';
import * as solid from '../../dist/core/Solid/index.js';

function trackedResource() {
  const calls = [];
  const original = createResource((input, { signal }) => {
    const deferred = Promise.withResolvers();
    calls.push({ ...deferred, input, signal });
    return deferred.promise;
  });
  let active = 0;
  const track = subscribe => (...args) => {
    active++;
    const stop = subscribe(...args);
    return () => { active--; stop(); };
  };
  const resource = {
    ...original,
    store: {
      ...original.store,
      subscribe: track(original.store.subscribe),
      subscribeSelector: track(original.store.subscribeSelector),
    },
  };
  return { resource, calls, active: () => active };
}

export async function nativeLifecycle(framework) {
  const tracked = trackedResource();
  const binding = { vue, angular, solid, svelte }[framework].bindResource(tracked.resource);
  const host = document.createElement('div');
  document.body.append(host);
  let read;
  let cleanup;
  let flush = async () => {};
  if (framework === 'vue') {
    const app = createApp({
      setup() {
        const { state } = binding();
        read = () => state.value;
        return () => h('output', state.value.status === 'success' ? state.value.data : state.value.status);
      },
    });
    app.mount(host);
    cleanup = () => app.unmount();
    flush = nextTick;
  } else if (framework === 'solid') {
    cleanup = render(() => {
      const { state } = binding();
      read = state;
      const output = document.createElement('output');
      createRenderEffect(() => { output.textContent = state().status === 'success' ? state().data : state().status; });
      return output;
    }, host);
  } else if (framework === 'angular') {
    const injector = createEnvironmentInjector([]);
    read = runInInjectionContext(injector, () => binding().state);
    cleanup = () => injector.destroy();
  } else {
    let state;
    const component = mount(ResourceView, { target: host, props: { binding, observe: next => { state = next; } } });
    read = () => state;
    cleanup = () => unmount(component);
    flush = tick;
  }
  await flush();
  const states = [read().status];
  const first = binding.run(1);
  await flush();
  states.push(read().status);
  tracked.calls[0].resolve('first');
  await first;
  await flush();
  states.push(read().status + ':' + read().data);
  const failed = binding.run(2);
  const failure = new Error('failed');
  tracked.calls[1].reject(failure);
  await failed;
  await flush();
  states.push(read().status + ':' + read().error.message);
  const retried = binding.run(3);
  await flush();
  states.push(read().status);
  tracked.calls[2].resolve('retry');
  await retried;
  await flush();
  states.push(read().status + ':' + read().data);
  const rendered = framework === 'angular' ? read().data : host.textContent;
  // Direct runs remain observable: normal helpers do not own execution.
  const borrowed = tracked.resource.run(4);
  await flush();
  const active = tracked.active();
  await cleanup();
  const remaining = tracked.active();
  const aborted = tracked.calls[3].signal.aborted;
  tracked.calls[3].resolve('shared');
  await borrowed;
  await flush();
  host.remove();
  return { states, rendered, active, remaining, aborted, stopped: read().status, outcome: tracked.resource.store.getState() };
}

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? createElement('output', null, 'error') : this.props.children; }
}

function reactHarness(tracked, suspense = true) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const binding = react.bindResource(tracked.resource);
  const thrown = [];
  const errors = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host, { onCaughtError: error => errors.push(error) });
  function View() {
    let state;
    try {
      state = suspense ? binding.useSuspense() : binding();
    } catch (error) {
      thrown.push(error);
      throw error;
    }
    return createElement('output', null, state.status === 'success' ? state.data : state.status);
  }
  const draw = async (key = 0) => {
    await act(() => root.render(createElement(StrictMode, null,
      createElement(Boundary, { key }, createElement(Suspense, { fallback: 'loading' }, createElement(View))))));
  };
  const destroy = async () => { await act(() => root.unmount()); host.remove(); };
  return { binding, thrown, errors, host, draw, destroy };
}

export async function reactLifecycle() {
  const tracked = trackedResource();
  const view = reactHarness(tracked);
  await view.draw();
  const states = [view.host.innerText];
  let first;
  await act(() => { first = view.binding.run(1); });
  states.push(view.host.innerText);
  const promise = view.thrown[0];
  await view.draw();
  const stablePromise = promise === first && view.thrown.every(value => value === promise);
  await act(async () => { tracked.calls[0].resolve('first'); await first; });
  states.push(view.host.innerText);
  let failed;
  await act(() => { failed = view.binding.run(2); });
  const failure = new Error('failed');
  await act(async () => { tracked.calls[1].reject(failure); await failed; });
  states.push(view.host.innerText);
  const exactError = view.errors[0] === failure;
  const retried = view.binding.run(3);
  await view.draw(1);
  states.push(view.host.innerText);
  await act(async () => { tracked.calls[2].resolve('retry'); await retried; });
  states.push(view.host.innerText);
  let cancelled;
  await act(() => { cancelled = view.binding.run(4); });
  await act(async () => { tracked.resource.cancel(); await cancelled; });
  states.push(view.host.innerText);
  let disposed;
  await act(() => { disposed = view.binding.run(5); });
  await act(async () => { tracked.resource.dispose(); await disposed; });
  states.push(view.host.innerText);
  const skipped = await view.binding.run(6);
  await view.draw(2);
  states.push(view.host.innerText);
  await view.destroy();
  return { states, stablePromise, exactError, skipped: skipped.status, remaining: tracked.active() };
}

export async function reactUnmount(initiallyPending) {
  const tracked = trackedResource();
  const view = reactHarness(tracked);
  if (!initiallyPending) await view.draw();
  let outcome;
  await act(() => { outcome = view.binding.run(1); });
  await view.draw();
  const pendingSubscriptions = tracked.active();
  await view.destroy();
  const remaining = tracked.active();
  const aborted = tracked.calls[0].signal.aborted;
  tracked.calls[0].resolve('shared');
  await outcome;
  return { pendingSubscriptions, remaining, aborted, status: tracked.resource.store.getState().status };
}

export async function reactReplacement() {
  const tracked = trackedResource();
  const view = reactHarness(tracked);
  const first = view.binding.run(1);
  await view.draw();
  let second;
  await act(() => { second = view.binding.run(2); });
  await view.draw();
  const replaced = view.thrown.at(-1) === second && second !== first;
  const skipped = await view.binding.run(3, { signal: AbortSignal.abort('skip') });
  await view.draw();
  const retained = view.thrown.at(-1) === second;
  await act(async () => { tracked.calls[1].resolve('latest'); await second; });
  const text = view.host.innerText;
  tracked.calls[0].resolve('stale');
  await first;
  await view.destroy();
  return { replaced, retained, text, skipped: skipped.status, remaining: tracked.active() };
}

export async function reactExternalRun(suspense) {
  const tracked = trackedResource();
  const view = reactHarness(tracked, suspense);
  const outcome = tracked.resource.run(1);
  await view.draw();
  const pending = view.host.innerText;
  await act(async () => { tracked.calls[0].resolve('external'); await outcome; });
  const complete = view.host.innerText;
  await view.destroy();
  return { pending, complete, errors: view.errors.length, remaining: tracked.active() };
}

export async function reactInitialCancel(operation) {
  const tracked = trackedResource();
  const view = reactHarness(tracked);
  const outcome = view.binding.run(1);
  await view.draw();
  const pendingSubscriptions = tracked.active();

  await act(async () => { tracked.resource[operation](); await outcome; });

  const text = view.host.innerText;
  const aborted = tracked.calls[0].signal.aborted;
  await view.destroy();
  return { text, aborted, pendingSubscriptions, remaining: tracked.active() };
}
