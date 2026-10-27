import { expect, test } from 'bun:test';
import { cookieStorage, dispose, jsonStorage, persist, PersistError } from '../../src/middleware';
import type { PersistCodec } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';
import { MemoryStorage, withBrowserFakes } from '../fixtures/helpers/browserFakes';

const dateCodec: PersistCodec = {
  serialize: (envelope) => {
    if (!(envelope.state instanceof Date)) throw new TypeError('Expected Date');
    return JSON.stringify({ state: envelope.state.getTime(), version: envelope.version });
  },
  deserialize: (text) => JSON.parse(text, (key, value: unknown) =>
    key === 'state' && typeof value === 'number' ? new Date(value) : value),
};
const decodeDate = (value: unknown): Date | null =>
  value instanceof Date && Number.isFinite(value.getTime()) ? value : null;

for (const kind of ['json', 'cookie'] as const) {
  test(`codec: ${kind} Date envelope -> round trips through serialization and unknown decoding`, async () => {
    await withBrowserFakes<Date, Promise<void>>(async (storage) => {
      const factory = kind === 'json' ? jsonStorage(() => storage, dateCodec) : cookieStorage({ codec: dateCodec });
      const create = () => pipe.use(persist({ key: 'date', storage: factory, decode: decodeDate })).create(new Date(0));
      const first = create();
      await first.persist.rehydrate();
      first.set(new Date(1_700_000_000_000));
      await first.persist.flush();
      dispose(first);

      const second = create();
      await second.persist.rehydrate();

      expect(second.getState()).toBeInstanceOf(Date);
      expect(second.getState().getTime()).toBe(1_700_000_000_000);
      expect(second.persist.getStatus().pending).toBe(false);
      dispose(second);
    });
  });
}

for (const payload of [null, { state: 1, version: 0 }, { state: new Date(0), version: 9 }]) {
  test(`codec: untrusted result ${String(payload)} -> does not bypass envelope or decoder validation`, async () => {
    const storage = new MemoryStorage();
    storage.setItem('date', 'custom');
    const codec: PersistCodec = { serialize: dateCodec.serialize, deserialize: () => payload };
    const store = pipe.use(persist({
      key: 'date', storage: jsonStorage(() => storage, codec), decode: decodeDate,
    })).create(new Date(0));

    await expect(store.persist.rehydrate()).rejects.toMatchObject({
      code: payload === null ? 'STORAGE' : 'INVALID_DATA',
    });

    expect(store.getState().getTime()).toBe(0);
    expect(storage.getItem('date')).toBe('custom');
  });
}

test('codec: serialization fails -> retains pending target for retry with original cause', async () => {
  const storage = new MemoryStorage();
  const failure = new PersistError('hydrate', 'INVALID_DATA', 'encode failed');
  let failing = true;
  const store = pipe.use(persist({
    key: 'date', decode: decodeDate,
    storage: jsonStorage(() => storage, {
      deserialize: dateCodec.deserialize,
      serialize: envelope => { if (failing) throw failure; return dateCodec.serialize(envelope); },
    }),
  })).create(new Date(0));
  await store.persist.rehydrate();
  store.set(new Date(123));
  await expect(store.persist.flush()).rejects.toMatchObject({ code: 'STORAGE', cause: failure });
  expect(store.persist.getStatus().pending).toBe(true);

  failing = false;
  await store.persist.retry();

  expect(storage.getItem('date')).toBe('{"state":123,"version":0}');
});
