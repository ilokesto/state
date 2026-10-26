import '@angular/compiler';
import { createElement, StrictMode } from 'react';
import { hydrateRoot, createRoot } from '../../../website/node_modules/react-dom/client.js';
import { flushSync as flushReact } from '../../../website/node_modules/react-dom/index.js';
import { createSSRApp, createApp, nextTick } from 'vue';
import { hydrate as hydrateSvelte, mount, unmount, flushSync as flushSvelte } from 'svelte';
import { hydrate as hydrateSolid, render as renderSolid, getNextElement, insert } from 'solid-js/web';
import { bootstrapApplication, provideClientHydration } from '@angular/platform-browser';
import { bindReadonly as bindSolid } from '../../../dist/core/Solid/index.js';
import Counter from './Counter.svelte';
import { angularView, counterToken } from './angular.js';
import { reactView, vueView } from './views.js';
import { createScope, factory, selectCount, selectLabel } from './shared.js';

export async function exercise(framework) {
  const scope = createScope();
  const store = scope.create(() => factory.hydrate(document.querySelector('#state').textContent));
  const consumer = createScope();
  const borrowed = consumer.borrow(store);
  const host = document.querySelector('#app');
  const original = host.querySelector('output');
  const initial = original.textContent;
  const errors = [];
  let stop;
  let flush;
  let replace;
  async function start(selector, hydrate) {
    if (framework === 'react') {
      let ready;
      const committed = new Promise(resolve => { ready = resolve; });
      const View = reactView(borrowed, ready);
      const element = selector => createElement(StrictMode, null, createElement(View, { selector }));
      const root = hydrate
        ? hydrateRoot(host, element(selector), { onRecoverableError: error => errors.push(error.message) })
        : createRoot(host);
      if (!hydrate) flushReact(() => root.render(element(selector)));
      await committed;
      stop = () => flushReact(() => root.unmount());
      flush = callback => flushReact(callback);
      replace = next => flushReact(() => root.render(element(next)));
    } else if (framework === 'vue') {
      const app = (hydrate ? createSSRApp : createApp)(vueView(borrowed, selector));
      app.mount(host);
      await nextTick();
      stop = () => app.unmount();
      flush = async callback => { callback(); await nextTick(); };
    } else if (framework === 'svelte') {
      const component = (hydrate ? hydrateSvelte : mount)(Counter, { target: host, props: { store: borrowed, selector } });
      flushSvelte();
      stop = () => unmount(component);
      flush = callback => flushSvelte(callback);
    } else if (framework === 'solid') {
      stop = (hydrate ? hydrateSolid : renderSolid)(() => {
        const { state } = bindSolid(borrowed)(selector);
        const output = hydrate ? getNextElement() : document.createElement('output');
        insert(output, state);
        return output;
      }, host);
      flush = callback => callback();
    } else {
      if (!hydrate) host.innerHTML = '<state-counter></state-counter>';
      const app = await bootstrapApplication(angularView(selector), {
        providers: [
          ...(hydrate ? [provideClientHydration()] : []),
          { provide: counterToken, useValue: borrowed },
        ],
      });
      await app.whenStable();
      stop = () => app.destroy();
      flush = async callback => { callback(); await app.whenStable(); };
    }
  }
  await start(selectCount, true);
  const reused = original === host.querySelector('output');
  const hydrated = host.textContent.trim();
  const active = store.active;
  consumer.dispose();
  const borrowedAlive = store.cleaned === 0;
  await flush(() => store.set({ count: store.getState().count + 10, label: 'updated' }));
  const updated = host.textContent.trim();
  let replaced;
  if (replace) {
    replace(selectLabel);
    replaced = host.textContent.trim();
  }
  await stop();
  const remaining = store.active;
  host.replaceChildren();
  await start(selectLabel, false);
  const remounted = host.textContent.trim();
  await flush(() => store.set({ count: 99, label: 'again' }));
  const repeatedUpdate = host.textContent.trim();
  await stop();
  const finalSubscriptions = store.active;
  scope.dispose();
  return {
    initial, hydrated, reused, active, borrowedAlive, updated,
    replaced: replaced ?? null, remaining, remounted, repeatedUpdate,
    finalSubscriptions, cleaned: store.cleaned, errors,
  };
}
