import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { chromium } from '@playwright/test';

const packages = new URL('../../', import.meta.url);
const document = `<!doctype html><html><head>
<script type="importmap">{"imports":{"@ilokesto/store":"/store/dist/index.js"}}</script>
</head><body></body></html>`;
let server;
let browser;
let context;
let page;
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
      const content = await readFile(fileURLToPath(new URL(`.${pathname}`, packages)));
      response.writeHead(200, { 'content-type': 'text/javascript' }).end(content);
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

beforeEach(async () => {
  context = await browser.newContext();
  page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(async () => {
    window.api = {
      ...await import('/state/dist/middleware/index.js'),
      ...await import('/state/dist/utils/index.js'),
    };
    window.signal = () => {
      let resolve;
      let reject;
      const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      return { promise, resolve, reject };
    };
    // Timers only bound failures; progress always comes from native events.
    window.bounded = (promise) => {
      let timer;
      return Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Browser event did not arrive')), 5_000);
        }),
      ]).finally(() => clearTimeout(timer));
    };
    window.requestResult = (request) => bounded(new Promise((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    }));
    window.outcome = (promise) => promise.then(
      () => ({ fulfilled: true }),
      error => ({
        fulfilled: false,
        name: error.name,
        code: error.code,
        cause: error.cause?.name,
      }),
    );
  });
});

afterEach(async () => {
  await context?.close();
});

test('persist: native structured values -> flush and reconnect preserve every value', { timeout: 15_000 }, async () => {
  const result = await page.evaluate(async () => {
    const { dispose, indexedDBStorage, persist, pipe } = api;
    const database = 'structured-values';
    const options = () => ({
      key: 'editor',
      storage: indexedDBStorage({ database }),
      decode: value => value,
    });
    const first = pipe.use(persist(options())).create({});
    await first.persist.rehydrate();
    first.set({
      file: new File(['native file content'], 'draft.txt', {
        type: 'text/plain',
        lastModified: 1_700_000_000_000,
      }),
      blob: new Blob(['image bytes'], { type: 'image/png' }),
      map: new Map([['draft', { revision: 3 }]]),
      set: new Set(['one', 'two']),
      date: new Date('2025-02-03T04:05:06.000Z'),
      buffer: new Uint8Array([0, 1, 128, 255]).buffer,
    });

    await first.persist.flush();
    dispose(first);
    const second = pipe.use(persist(options())).create({});
    await second.persist.rehydrate();
    const restored = second.getState();
    const values = {
      types: [
        restored.file instanceof File,
        restored.blob instanceof Blob,
        restored.map instanceof Map,
        restored.set instanceof Set,
        restored.date instanceof Date,
        restored.buffer instanceof ArrayBuffer,
      ],
      file: {
        name: restored.file.name,
        type: restored.file.type,
        lastModified: restored.file.lastModified,
        content: await restored.file.text(),
      },
      blob: { type: restored.blob.type, content: await restored.blob.text() },
      map: [...restored.map],
      set: [...restored.set],
      date: restored.date.toISOString(),
      buffer: [...new Uint8Array(restored.buffer)],
      pending: second.persist.getStatus().pending,
    };
    dispose(second);
    return values;
  });

  assert.deepEqual(result, {
    types: [true, true, true, true, true, true],
    file: {
      name: 'draft.txt',
      type: 'text/plain',
      lastModified: 1_700_000_000_000,
      content: 'native file content',
    },
    blob: { type: 'image/png', content: 'image bytes' },
    map: [['draft', { revision: 3 }]],
    set: ['one', 'two'],
    date: '2025-02-03T04:05:06.000Z',
    buffer: [0, 1, 128, 255],
    pending: false,
  });
});

test('indexedDBStorage: successful operations -> promises settle after transaction complete', { timeout: 15_000 }, async () => {
  const result = await page.evaluate(async () => {
    const adapter = api.indexedDBStorage({ database: 'transaction-complete' })();
    const events = [];
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const active = transaction.apply(this, args);
      active.addEventListener('complete', () => events.push('complete'), { once: true });
      return active;
    };
    for (const method of ['put', 'getAll', 'delete']) {
      const operation = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (...args) {
        const request = operation.apply(this, args);
        request.addEventListener('success', () => events.push('request'), { once: true });
        return request;
      };
    }

    await adapter.setItem('item', { state: 1, version: 0 }).then(() => events.push('set'));
    const stored = await adapter.getItem('item').then(value => {
      events.push('get');
      return value;
    });
    await adapter.removeItem('item').then(() => events.push('remove'));
    adapter.dispose();
    return { events, stored };
  });

  assert.deepEqual(result, {
    events: ['request', 'complete', 'set', 'request', 'complete', 'get', 'request', 'complete', 'remove'],
    stored: { state: 1, version: 0 },
  });
});

test('indexedDBStorage: abort after native put success -> rejects and rolls back the write', { timeout: 15_000 }, async () => {
  const result = await page.evaluate(async () => {
    const adapter = api.indexedDBStorage({ database: 'abort-after-success' })();
    await adapter.getItem('item');
    const events = [];
    const aborted = signal();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      const active = this.transaction;
      active.addEventListener('abort', () => {
        events.push('abort');
        aborted.resolve();
      }, { once: true });
      request.addEventListener('success', () => {
        events.push('request');
        active.abort();
      }, { once: true });
      return request;
    };

    const write = await bounded(outcome(adapter.setItem('item', { state: 1, version: 0 })));
    await bounded(aborted.promise);
    const stored = await adapter.getItem('item');
    adapter.dispose();
    return { write, events, stored };
  });

  assert.equal(result.write.fulfilled, false);
  assert.equal(result.write.name, 'AbortError');
  assert.deepEqual(result.events, ['request', 'abort']);
  assert.equal(result.stored, null);
});

test('persist: noncloneable commit -> exposes native failure and retries a later valid commit', { timeout: 15_000 }, async () => {
  const result = await page.evaluate(async () => {
    const { dispose, indexedDBStorage, persist, pipe } = api;
    const storage = indexedDBStorage({ database: 'clone-failure' });
    const store = pipe.use(persist({
      key: 'draft',
      storage,
      decode: value => value,
    })).create({ value: 'initial' });
    await store.persist.rehydrate();

    store.set({ value: () => 'not cloneable' });
    const failure = await bounded(outcome(store.persist.flush()));
    const failedStatus = store.persist.getStatus();
    const reader = storage();
    const afterFailure = await reader.getItem('draft');
    store.set({ value: 'retry' });
    await store.persist.flush();
    const afterRetry = await reader.getItem('draft');
    const pending = store.persist.getStatus().pending;
    reader.dispose();
    dispose(store);
    return {
      failure,
      saving: failedStatus.saving,
      failedPending: failedStatus.pending,
      afterFailure,
      afterRetry,
      pending,
    };
  });

  assert.equal(result.failure.fulfilled, false);
  assert.equal(result.failure.code, 'STORAGE');
  assert.equal(result.failure.cause, 'DataCloneError');
  assert.equal(result.saving, 'error');
  assert.equal(result.failedPending, true);
  assert.equal(result.afterFailure, null);
  assert.deepEqual(result.afterRetry, { state: { value: 'retry' }, version: 0 });
  assert.equal(result.pending, false);
});

test('persist: clear during an unfinished write -> queued values cannot resurrect the deleted key', { timeout: 15_000 }, async () => {
  const result = await page.evaluate(async () => {
    const { dispose, indexedDBStorage, persist, pipe } = api;
    const storage = indexedDBStorage({ database: 'clear-ordering' });
    const store = pipe.use(persist({
      key: 'draft',
      storage,
      decode: value => value,
    })).create(0);
    await store.persist.rehydrate();
    const reader = storage();
    await reader.setItem('unrelated', { state: 'keep', version: 0 });
    const cleared = signal();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      request.addEventListener('success', () => {
        store.set(2);
        store.persist.clearStorage().then(cleared.resolve, cleared.reject);
      }, { once: true });
      IDBObjectStore.prototype.put = put;
      return request;
    };

    store.set(1);
    await bounded(cleared.promise);
    await store.persist.flush();
    const stored = await reader.getItem('draft');
    const unrelated = await reader.getItem('unrelated');
    const memory = store.getState();
    reader.dispose();
    dispose(store);
    return { stored, unrelated, memory };
  });

  assert.deepEqual(result, {
    stored: null,
    unrelated: { state: 'keep', version: 0 },
    memory: 2,
  });
});

test('persist: shared factory and key -> disposing one store leaves the other transaction owned independently', { timeout: 15_000 }, async () => {
  const result = await page.evaluate(async () => {
    const { dispose, indexedDBStorage, persist, pipe } = api;
    const storage = indexedDBStorage({ database: 'shared-factory' });
    const create = () => pipe.use(persist({
      key: 'draft',
      storage,
      decode: value => value,
    })).create(0);
    const connections = new Set();
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      connections.add(this);
      return transaction.apply(this, args);
    };
    const first = create();
    const second = create();
    await first.persist.rehydrate();
    await second.persist.rehydrate();
    const connectionsBeforeWrite = connections.size;
    const put = IDBObjectStore.prototype.put;
    let disposedDuringSuccess = false;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      request.addEventListener('success', () => {
        dispose(first);
        disposedDuringSuccess = true;
      }, { once: true });
      IDBObjectStore.prototype.put = put;
      return request;
    };

    second.set(1);
    await second.persist.flush();
    second.set(2);
    await second.persist.flush();
    const reader = storage();
    const stored = await reader.getItem('draft');
    const statuses = [first.persist.getStatus().disposed, second.persist.getStatus().disposed];
    reader.dispose();
    dispose(second);
    return { connectionsBeforeWrite, disposedDuringSuccess, stored, statuses };
  });

  assert.deepEqual(result, {
    connectionsBeforeWrite: 2,
    disposedDuringSuccess: true,
    stored: { state: 2, version: 0 },
    statuses: [true, false],
  });
});

test('persist: dispose after put success -> aborts the unfinished transaction and rejects flush', { timeout: 15_000 }, async () => {
  const result = await page.evaluate(async () => {
    const { dispose, indexedDBStorage, persist, pipe } = api;
    const storage = indexedDBStorage({ database: 'dispose-transaction' });
    const store = pipe.use(persist({
      key: 'draft',
      storage,
      decode: value => value,
    })).create(0);
    await store.persist.rehydrate();
    const events = [];
    const aborted = signal();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      this.transaction.addEventListener('abort', () => {
        events.push('abort');
        aborted.resolve();
      }, { once: true });
      request.addEventListener('success', () => {
        events.push('request');
        dispose(store);
      }, { once: true });
      IDBObjectStore.prototype.put = put;
      return request;
    };

    store.set(1);
    const flushing = outcome(store.persist.flush());
    await bounded(aborted.promise);
    const flush = await bounded(flushing);
    const replacement = pipe.use(persist({
      key: 'draft',
      storage,
      decode: value => value,
    })).create(7);
    await replacement.persist.rehydrate();
    const restored = replacement.getState();
    replacement.set(8);
    await replacement.persist.flush();
    const reader = storage();
    const stored = await reader.getItem('draft');
    const disposed = store.persist.getStatus().disposed;
    reader.dispose();
    dispose(replacement);
    return { flush, events, restored, stored, disposed };
  });

  assert.equal(result.flush.fulfilled, false);
  assert.equal(result.flush.code, 'DISPOSED');
  assert.deepEqual(result.events, ['request', 'abort']);
  assert.equal(result.restored, 7);
  assert.deepEqual(result.stored, { state: 8, version: 0 });
  assert.equal(result.disposed, true);
});

test('indexedDBStorage: dispose before open succeeds -> rejects pending work and closes the eventual connection', { timeout: 15_000 }, async () => {
  const result = await page.evaluate(async () => {
    const database = 'dispose-open';
    const seed = indexedDB.open(database, 1);
    seed.addEventListener('upgradeneeded', () => seed.result.createObjectStore('state'), { once: true });
    (await requestResult(seed)).close();
    const opened = signal();
    const closed = signal();
    const open = IDBFactory.prototype.open;
    const close = IDBDatabase.prototype.close;
    let transactions = 0;
    IDBFactory.prototype.open = function (...args) {
      const request = open.apply(this, args);
      request.addEventListener('success', () => opened.resolve(request.result), { once: true });
      return request;
    };
    IDBDatabase.prototype.close = function (...args) {
      const result = close.apply(this, args);
      closed.resolve(this);
      return result;
    };
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      transactions += 1;
      return transaction.apply(this, args);
    };
    const adapter = api.indexedDBStorage({ database })();

    const pending = outcome(adapter.getItem('draft'));
    adapter.dispose();
    const read = await bounded(pending);
    const eventualConnection = await bounded(opened.promise);
    const closedConnection = await bounded(closed.promise);
    const deletion = indexedDB.deleteDatabase(database);
    let blocked = false;
    deletion.addEventListener('blocked', () => { blocked = true; }, { once: true });
    await requestResult(deletion);
    return { read, closedOwnedConnection: eventualConnection === closedConnection, transactions, blocked };
  });

  assert.equal(result.read.fulfilled, false);
  assert.equal(result.read.name, 'AbortError');
  assert.equal(result.closedOwnedConnection, true);
  assert.equal(result.transactions, 0);
  assert.equal(result.blocked, false);
});

test('cookieStorage: write and reconnect -> encoded content restores and clear removes only its key', { timeout: 15_000 }, async () => {
  const result = await page.evaluate(async () => {
    const { cookieStorage, dispose, persist, pipe } = api;
    const make = () => pipe.use(persist({
      key: 'editor-cookie',
      storage: cookieStorage({ path: '/', sameSite: 'Lax' }),
      decode: value => value,
    })).create({ text: '' });
    const first = make();
    await first.persist.rehydrate();
    document.cookie = 'unrelated=keep; path=/';

    first.set({ text: 'semicolon; percent% and encoded%20value' });
    await first.persist.flush();
    const encoded = document.cookie.split('; ').find(value => value.startsWith('editor-cookie='));
    dispose(first);
    const second = make();
    await second.persist.rehydrate();
    const restored = second.getState();
    await second.persist.clearStorage();
    const memory = second.getState();
    const remaining = document.cookie;
    dispose(second);
    return { encoded, restored, memory, remaining };
  });

  assert.equal(result.encoded, `editor-cookie=${encodeURIComponent(JSON.stringify({
    state: { text: 'semicolon; percent% and encoded%20value' },
    version: 0,
  }))}`);
  assert.deepEqual(result.restored, { text: 'semicolon; percent% and encoded%20value' });
  assert.deepEqual(result.memory, result.restored);
  assert.equal(result.remaining, 'unrelated=keep');
});

test('persist: legacy envelopes in Web Storage and raw or encoded cookies -> restore at the original key', { timeout: 15_000 }, async () => {
  const result = await page.evaluate(async () => {
    const { cookieStorage, dispose, jsonStorage, persist, pipe } = api;
    const value = { state: { text: 'literal%20value', count: 3 }, version: 0 };
    const serialized = JSON.stringify(value);
    localStorage.setItem('legacy-local', serialized);
    sessionStorage.setItem('legacy-session', serialized);
    document.cookie = `legacy-raw=${serialized}; path=/`;
    document.cookie = `legacy-encoded=${encodeURIComponent(serialized)}; path=/`;
    const cases = [
      ['legacy-local', jsonStorage(() => localStorage)],
      ['legacy-session', jsonStorage(() => sessionStorage)],
      ['legacy-raw', cookieStorage()],
      ['legacy-encoded', cookieStorage()],
    ];
    const restored = [];

    for (const [key, storage] of cases) {
      const store = pipe.use(persist({ key, storage, decode: input => input })).create({});
      await store.persist.rehydrate();
      restored.push(store.getState());
      dispose(store);
    }
    return restored;
  });

  assert.deepEqual(result, Array.from({ length: 4 }, () => ({ text: 'literal%20value', count: 3 })));
});

test('cookieStorage: browser rejects an oversized cookie -> adapter reports failure', { timeout: 15_000 }, async () => {
  const result = await page.evaluate(async () => {
    const adapter = api.cookieStorage({ path: '/' })();

    const write = await outcome(adapter.setItem('oversized', {
      state: 'x'.repeat(8_192),
      version: 0,
    }));
    return { write, stored: await adapter.getItem('oversized') };
  });

  assert.equal(result.write.fulfilled, false);
  assert.equal(result.stored, null);
});

for (const valueKind of ['null', 'undefined']) {
  test(`persist: malformed native ${valueKind} record -> rejects hydration without overwriting`, { timeout: 15_000 }, async () => {
    const result = await page.evaluate(async (kind) => {
      const malformed = kind === 'null' ? null : undefined;
      const database = `malformed-${kind}`;
      const request = indexedDB.open(database, 1);
      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore('state');
      }, { once: true });
      const db = await requestResult(request);
      const transaction = db.transaction('state', 'readwrite');
      const seeded = bounded(new Promise((resolve, reject) => {
        transaction.addEventListener('complete', resolve, { once: true });
        transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
      }));
      transaction.objectStore('state').put(malformed, 'draft');
      await seeded;
      let decodes = 0;
      const store = api.pipe.use(api.persist({
        key: 'draft',
        storage: api.indexedDBStorage({ database }),
        decode: value => { decodes += 1; return typeof value === 'number' ? value : null; },
      })).create(0);

      const hydration = await outcome(store.persist.rehydrate());
      const status = store.persist.getStatus().hydration;
      const restored = store.getState();
      store.set(7);
      const flush = await outcome(store.persist.flush());
      const values = await requestResult(db.transaction('state').objectStore('state').getAll('draft'));
      api.dispose(store);
      db.close();
      return {
        hydration, status, restored, decodes, flush,
        stillPresent: values.length === 1,
        unchanged: Object.is(values[0], malformed),
      };
    }, valueKind);

    assert.equal(result.hydration.fulfilled, false);
    assert.equal(result.status, 'error');
    assert.equal(result.restored, 0);
    assert.equal(result.decodes, 0);
    assert.equal(result.flush.code, 'NOT_HYDRATED');
    assert.equal(result.stillPresent, true);
    assert.equal(result.unchanged, true);
  });
}
