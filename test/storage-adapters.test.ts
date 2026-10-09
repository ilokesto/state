import { expect, test } from 'bun:test';
import { cookieStorage } from '../src/middleware/persist/storage/cookieStorage.js';
import { indexedDBStorage } from '../src/middleware/persist/storage/indexedDBStorage.js';
import { jsonStorage } from '../src/middleware/persist/storage/jsonStorage.js';
import { MemoryStorage, restoreBrowserGlobal } from './helpers/browserFakes.js';

test('jsonStorage: factory definition -> getter remains deferred until activation', () => {
  const storage = new MemoryStorage();
  let calls = 0;

  const factory = jsonStorage(() => { calls += 1; return storage; });

  expect(calls).toBe(0);
  factory();
  expect(calls).toBe(1);
});

test('jsonStorage: reused factory -> adapters independently capture their backing storage', async () => {
  const firstStorage = new MemoryStorage();
  const secondStorage = new MemoryStorage();
  let selectedStorage = firstStorage;
  const factory = jsonStorage(() => selectedStorage);
  const first = factory();
  selectedStorage = secondStorage;
  const second = factory();

  await first.setItem('draft', { state: 1, version: 0 });
  await second.setItem('draft', { state: 2, version: 0 });

  expect(await first.getItem('draft')).toEqual({ state: 1, version: 0 });
  expect(await second.getItem('draft')).toEqual({ state: 2, version: 0 });
});

test('jsonStorage: existing envelope -> reads legacy state and version', async () => {
  const storage = new MemoryStorage();
  storage.setItem('draft', '{"state":{"count":4},"version":2}');
  const adapter = jsonStorage(() => storage)();

  const restored = await adapter.getItem('draft');

  expect(restored).toEqual({ state: { count: 4 }, version: 2 });
});

test('jsonStorage: deletion -> removes only the selected key', async () => {
  const storage = new MemoryStorage();
  const adapter = jsonStorage(() => storage)();
  await adapter.setItem('first', { state: 1, version: 0 });
  await adapter.setItem('second', { state: 2, version: 0 });

  await adapter.removeItem('first');

  expect(await adapter.getItem('first')).toBeNull();
  expect(await adapter.getItem('second')).toEqual({ state: 2, version: 0 });
});

test('jsonStorage: corrupt JSON -> read rejects instead of returning an empty state', async () => {
  const storage = new MemoryStorage();
  storage.setItem('draft', '{invalid');
  const adapter = jsonStorage(() => storage)();

  const result = adapter.getItem('draft');

  await expect(result).rejects.toBeInstanceOf(SyntaxError);
});

test('jsonStorage: stored null envelope -> rejects instead of treating the key as absent', async () => {
  const storage = new MemoryStorage();
  storage.setItem('draft', 'null');
  const adapter = jsonStorage(() => storage)();

  const result = adapter.getItem('draft');

  await expect(result).rejects.toBeInstanceOf(TypeError);
});

test('jsonStorage: quota exception -> write rejects with the original cause', async () => {
  const failure = new DOMException('full', 'QuotaExceededError');
  class FullStorage extends MemoryStorage {
    override setItem(): void { throw failure; }
  }
  const adapter = jsonStorage(() => new FullStorage())();

  const result = adapter.setItem('draft', { state: 1, version: 0 });

  await expect(result).rejects.toBe(failure);
});

for (const state of [new Map([['x', 1]]), new Set([1]), new Blob(['x']), 1n, undefined, Infinity]) {
  test(`jsonStorage: unsupported ${Object.prototype.toString.call(state)} -> rejects without overwriting`, async () => {
    const storage = new MemoryStorage();
    storage.setItem('draft', '{"state":1,"version":0}');
    const adapter = jsonStorage(() => storage)();

    const result = adapter.setItem('draft', { state, version: 0 });

    await expect(result).rejects.toBeInstanceOf(TypeError);
    expect(storage.getItem('draft')).toBe('{"state":1,"version":0}');
  });
}

test('storage helpers: no browser globals -> definition performs no browser access', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    get() { throw new Error('document accessed before activation'); },
  });
  try {
    expect(typeof cookieStorage({ path: '/' })).toBe('function');
    expect(typeof indexedDBStorage({ database: 'ssr' })).toBe('function');
    expect(typeof jsonStorage(() => window.localStorage)).toBe('function');
  } finally {
    restoreBrowserGlobal('document', descriptor);
  }
});

for (const encoded of [false, true]) {
  test(`cookieStorage: legacy ${encoded ? 'encoded' : 'raw'} JSON -> preserves percent characters`, async () => {
    const payload = { state: { text: '100% = done' }, version: 0 };
    const serialized = JSON.stringify(payload);
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { cookie: `other=x; draft=${encoded ? encodeURIComponent(serialized) : serialized}` },
    });
    try {
      const restored = await cookieStorage()().getItem('draft');

      expect(restored).toEqual(payload);
    } finally {
      restoreBrowserGlobal('document', descriptor);
    }
  });
}

test('cookieStorage: browser rejects a write -> operation rejects instead of reporting success', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { get cookie() { return ''; }, set cookie(_value: string) {} },
  });
  try {
    const result = cookieStorage()().setItem('draft', { state: 1, version: 0 });

    await expect(result).rejects.toBeInstanceOf(Error);
  } finally {
    restoreBrowserGlobal('document', descriptor);
  }
});

test('cookieStorage: stored null envelope -> rejects instead of treating the key as absent', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { cookie: 'draft=null' },
  });
  try {
    const result = cookieStorage()().getItem('draft');

    await expect(result).rejects.toBeInstanceOf(TypeError);
  } finally {
    restoreBrowserGlobal('document', descriptor);
  }
});
