import '@angular/compiler';
import { createElement } from 'react';
import { renderToString as renderReact } from 'react-dom/server.node';
import { createSSRApp } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { render as renderSvelte } from 'svelte/server';
import { renderToString as renderSolid, ssrElement, generateHydrationScript } from 'solid-js/web';
import { bootstrapApplication, provideClientHydration } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { bindReadonly as bindSolid } from '../../../../dist/core/Solid/index.js';
import Counter from './Counter.svelte';
import { angularView, counterToken } from './angular.js';
import { reactView, vueView } from './views.js';
import { createScope, factory, selectCount } from './shared.js';

export async function render(framework, count) {
  const scope = createScope();
  const store = scope.create(() => factory.create({ count, label: 'request-' + count }));
  let html;
  try {
    const payload = factory.serialize(store);
    const data = '<script id="state" type="application/json">' + payload + '</script>';
    if (framework === 'angular') {
      html = await renderApplication(
        context => bootstrapApplication(angularView(selectCount), {
          providers: [provideServerRendering(), provideClientHydration(), { provide: counterToken, useValue: store }],
        }, context),
        { document: '<!doctype html><html><head></head><body><main id="app"><state-counter></state-counter></main>' + data + '</body></html>' },
      );
    } else {
      let body;
      let script = '';
      if (framework === 'react') {
        body = renderReact(createElement(reactView(store), { selector: selectCount }));
      } else if (framework === 'vue') {
        body = await renderVue(createSSRApp(vueView(store, selectCount)));
      } else if (framework === 'svelte') {
        body = renderSvelte(Counter, { props: { store, selector: selectCount } }).body;
      } else {
        body = renderSolid(() => {
          const { state } = bindSolid(store)(selectCount);
          return ssrElement('output', {}, state(), true);
        });
        script = generateHydrationScript();
      }
      html = '<!doctype html><html><head></head><body><main id="app">' + body + '</main>' + data + script + '</body></html>';
    }
    return { html, initial: store.getInitialState(), active: store.active };
  } finally {
    scope.dispose();
  }
}

export function reactInitialSnapshot() {
  const scope = createScope();
  try {
    const store = scope.create(() => factory.create({ count: 1, label: 'initial' }));
    store.set({ count: 9, label: 'current' });
    return {
      html: renderReact(createElement(reactView(store), { selector: selectCount })),
      payload: factory.serialize(store),
    };
  } finally {
    scope.dispose();
  }
}
