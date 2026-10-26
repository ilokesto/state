import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const installedStore = new URL('node_modules/@ilokesto/store/', root);
let server;
let browser;
let origin;

before(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html' }).end(
        '<!doctype html><script type="importmap">{"imports":{"@ilokesto/store":"/store/dist/index.js"}}</script>',
      );
      return;
    }
    if (!/^\/(state|store)\/dist\/[\w./-]+\.js$/.test(pathname)) {
      response.writeHead(404).end();
      return;
    }
    const target = pathname.startsWith('/state/')
      ? new URL(`.${pathname.slice('/state'.length)}`, root)
      : new URL(`.${pathname.slice('/store'.length)}`, installedStore);
    try {
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

test('devtools: browser extension messages -> validated jumps, detached payloads, and disposal remain coherent', { timeout: 15_000 }, async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(origin);
    const result = await page.evaluate(async () => {
      const { createReducer } = await import('/state/dist/index.js');
      const { devtools, dispose, history, jsonStorage, persist, validate } =
        await import('/state/dist/middleware/index.js');
      const { pipe } = await import('/state/dist/utils/index.js');
      const sends = [];
      const inits = [];
      let listener;
      let unsubscribed = 0;
      window.__REDUX_DEVTOOLS_EXTENSION__ = {
        connect: () => ({
          init: state => { inits.push(structuredClone(state)); },
          send: (action, state) => { sends.push(structuredClone({ action, state })); },
          subscribe: callback => {
            listener = callback;
            return () => { unsubscribed += 1; };
          },
        }),
      };
      const schema = {
        '~standard': {
          version: 1,
          vendor: 'browser',
          validate: value => typeof value === 'object' && value !== null &&
            typeof value.count === 'number' && value.count >= 0
            ? { value }
            : { issues: [{ message: 'invalid count' }] },
        },
      };
      const store = pipe.use(devtools('browser', {
        stateSanitizer: state => {
          state.secret.value = 'redacted';
          return state;
        },
        actionSanitizer: action => {
          if (typeof action !== 'string') action.payload.secret.value = 'redacted';
          return action;
        },
      })).use(history()).use(validate(schema, { onError: () => undefined })).use(persist({
        key: 'devtools-browser',
        storage: jsonStorage(() => localStorage),
        decode: value => value,
      })).create({ count: 0, secret: { value: 'initial' } });
      await store.persist.rehydrate();
      const reducer = createReducer((_state, action) => action.payload, store);
      const action = { type: 'replace', payload: { count: 1, secret: { value: 'private' } } };
      reducer.dispatch(action);
      await store.persist.flush();

      // Exercise the callback with native structured-cloned extension messages.
      const channel = new MessageChannel();
      channel.port1.onmessage = event => {
        try {
          listener(event.data);
          channel.port1.postMessage({ ok: true });
        } catch (error) {
          channel.port1.postMessage({ ok: false, name: error.name });
        }
      };
      const command = message => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Message response missing')), 5_000);
        channel.port2.addEventListener('message', event => {
          clearTimeout(timeout);
          resolve(event.data);
        }, { once: true });
        channel.port2.start();
        channel.port2.postMessage(message);
      });
      const replay = (type, state) => ({ type: 'DISPATCH', payload: { type }, state: JSON.stringify(state) });
      const malformed = await command({ type: 'DISPATCH', payload: { type: 'JUMP_TO_STATE' }, state: '{' });
      await command(replay('JUMP_TO_STATE', { count: -1, secret: { value: 'rejected' } }));
      const rejected = store.getState().count;
      await command(replay('JUMP_TO_ACTION', { count: 4, secret: { value: 'restored' } }));
      await store.persist.flush();
      const restored = store.getState();
      const saved = JSON.parse(localStorage.getItem('devtools-browser'));
      const canUndo = store.canUndo();
      dispose(store);
      await command(replay('JUMP_TO_STATE', { count: 9 }));
      store.set({ count: 5, secret: { value: 'after disposal' } });
      channel.port1.close();
      channel.port2.close();
      return { malformed, rejected, restored, saved, canUndo, sends, inits, action, unsubscribed, final: store.getState() };
    });

    assert.deepEqual(result.malformed, { ok: false, name: 'SyntaxError' });
    assert.equal(result.rejected, 1);
    assert.deepEqual(result.restored, { count: 4, secret: { value: 'restored' } });
    assert.deepEqual(result.saved, { state: result.restored, version: 0 });
    assert.equal(result.canUndo, false);
    assert.deepEqual(result.sends, [{
      action: { type: 'browser:replace', payload: { count: 1, secret: { value: 'redacted' } } },
      state: { count: 1, secret: { value: 'redacted' } },
    }]);
    assert.equal(result.action.payload.secret.value, 'private');
    assert.equal(result.unsubscribed, 1);
    assert.equal(result.final.count, 5);
    assert.deepEqual(result.inits, [{ count: 0, secret: { value: 'redacted' } }]);
  } finally {
    await context.close();
  }
});
