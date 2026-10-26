import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const installedStore = new URL('node_modules/@ilokesto/store/', root);
const document = `<!doctype html><html><head>
<script type="importmap">{"imports":{"@ilokesto/store":"/store/dist/index.js"}}</script>
</head><body></body></html>`;
let server;
let browser;
let origin;

before(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html' }).end(document);
      return;
    }
    if (!/^\/(state|store)\/dist\/[\w./-]+\.js$/.test(pathname)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const target = pathname.startsWith('/state/')
        ? new URL(`.${pathname.slice('/state'.length)}`, root)
        : new URL(`.${pathname.slice('/store'.length)}`, installedStore);
      response.writeHead(200, { 'content-type': 'text/javascript' }).end(await readFile(target));
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
});

test('URL bridge: native push replace back forward and disposal -> mirrors browser history without owning it', { timeout: 20_000 }, async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/?keep=yes&page=2#section`);
    const result = await page.evaluate(async () => {
      const { createUrlBridge } = await import('/state/dist/utils/index.js');
      history.replaceState({ router: 'owned' }, '');
      const bridge = createUrlBridge({
        key: 'page',
        defaultValue: 1,
        codec: {
          parse(value) {
            if (!/^[1-9]\d*$/.test(value)) {
              throw new Error('Invalid page');
            }
            return Number(value);
          },
          serialize: value => value === 1 ? null : String(value),
        },
        environment: window,
      });
      const seen = [];
      bridge.store.subscribe(() => seen.push(bridge.store.getState()));
      const initialLength = history.length;
      bridge.set(3, 'push');
      bridge.set(4);
      bridge.set(5, 'push');
      const addedEntries = history.length - initialLength;

      // Subscribe before traversal; the timer only bounds a missing native event.
      const traverse = direction => new Promise((resolve, reject) => {
        const onPopstate = () => {
          clearTimeout(timer);
          resolve({
            value: bridge.store.getState(),
            search: location.search,
            hash: location.hash,
            state: history.state,
          });
        };
        const timer = setTimeout(() => {
          removeEventListener('popstate', onPopstate);
          reject(new Error('History traversal did not emit popstate'));
        }, 5_000);
        addEventListener('popstate', onPopstate, { once: true });
        history[direction]();
      });
      const traversed = [];
      traversed.push(await traverse('back'));
      traversed.push(await traverse('back'));
      traversed.push(await traverse('forward'));
      traversed.push(await traverse('forward'));

      // A router can write externally; refresh is explicit because pushState emits no popstate.
      history.pushState({ router: 'malformed' }, '', '?keep=yes&page=bad#section');
      bridge.refresh();
      const malformed = { value: bridge.store.getState(), search: location.search };
      traversed.push(await traverse('back'));
      traversed.push(await traverse('forward'));
      bridge.set(1);
      const removed = { value: bridge.store.getState(), search: location.search, state: history.state };
      bridge.dispose();
      bridge.dispose();
      const afterDispose = await traverse('back');
      return { addedEntries, traversed, malformed, removed, afterDispose, seen };
    });

    assert.equal(result.addedEntries, 2);
    assert.deepEqual(result.traversed.map(entry => entry.value), [4, 2, 4, 5, 5, 1]);
    assert.deepEqual(result.traversed.map(entry => entry.search), [
      '?keep=yes&page=4', '?keep=yes&page=2', '?keep=yes&page=4',
      '?keep=yes&page=5', '?keep=yes&page=5', '?keep=yes&page=bad',
    ]);
    assert.ok(result.traversed.every(entry => entry.hash === '#section'));
    assert.deepEqual(result.traversed.slice(0, 5).map(entry => entry.state), Array.from({ length: 5 }, () => ({ router: 'owned' })));
    assert.deepEqual(result.malformed, { value: 1, search: '?keep=yes&page=bad' });
    assert.deepEqual(result.removed, { value: 1, search: '?keep=yes', state: { router: 'malformed' } });
    assert.equal(result.afterDispose.value, 1);
    assert.equal(result.afterDispose.search, '?keep=yes&page=5');
    assert.deepEqual(result.seen, [3, 4, 5, 4, 2, 4, 5, 1, 5, 1]);
  } finally {
    await context.close();
  }
});
