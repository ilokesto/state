import { expect, test } from 'bun:test';
import { createScope, createStateFactory, createStore } from '../../src';
import { persist } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter, deferred } from '../fixtures/helpers/persistStorage';

function decode(input: unknown): { count: number; label: string } {
  if (
    typeof input !== 'object' || input === null ||
    !('count' in input) || typeof input.count !== 'number' || !Number.isSafeInteger(input.count) ||
    !('label' in input) || typeof input.label !== 'string'
  ) throw new TypeError('Invalid counter');
  return { count: input.count, label: input.label };
}
const factory = createStateFactory({ decode });

test('state factory: overlapping requests -> independent stores and matching client initial snapshots', async () => {
  const firstReady = deferred<void>();
  const secondReady = deferred<void>();
  async function request(count: number) {
    const scope = createScope();
    try {
      const store = scope.create(() => factory.create({ count, label: 'request' }));
      if (count === 1) { firstReady.resolve(); await secondReady.promise; }
      else { await firstReady.promise; secondReady.resolve(); }
      store.set({ count: count + 10, label: 'later' });
      return factory.serialize(store);
    } finally {
      scope.dispose();
    }
  }

  const payloads = await Promise.all([request(1), request(2)]);
  const clients = payloads.map(payload => factory.hydrate(payload));

  expect(clients.map(store => store.getState())).toEqual([
    { count: 1, label: 'request' }, { count: 2, label: 'request' },
  ]);
  expect(clients[0]?.getInitialState()).toBe(clients[0]?.getState());
  expect(clients[1]?.getInitialState()).toBe(clients[1]?.getState());
});

test('state factory: shared decoder object -> nested state is detached for every request', () => {
  const cached = { nested: { count: 1 } };
  const configured = createStateFactory({ decode: () => cached });
  const first = configured.create(null);
  const second = configured.create(null);

  cached.nested.count = 9;
  first.getState().nested.count = 3;

  expect(second.getState().nested.count).toBe(1);
  expect(first.getInitialState()).not.toBe(cached);
});

test('state factory.serialize: script termination characters -> escaped JSON round-trips without executable markup', () => {
  const label = '</script><script>alert("x")</script>&>\u2028\u2029';
  const store = factory.create({ count: 1, label });

  const payload = factory.serialize(store);

  expect(payload).not.toMatch(/[<>&\u2028\u2029]/);
  expect(factory.hydrate(payload).getInitialState()).toEqual({ count: 1, label });
});

test('state factory.hydrate: domain rejection -> no store is constructed', () => {
  let constructions = 0;
  const configured = createStateFactory({
    decode,
    create(initial) { constructions++; return createStore(initial); },
  });

  expect(() => configured.hydrate('{"version":1,"state":{"count":"1","label":"bad"}}')).toThrow('Invalid counter');

  expect(constructions).toBe(0);
});

for (const payload of [
  '{', 'null', '[]', '{"state":null}', '{"version":2,"state":null}',
  '{"version":1,"state":null,"extra":true}',
  '{"version":1,"state":{"__proto__":{"polluted":true}}}',
  '{"version":1,"state":{"constructor":{"prototype":{"polluted":true}}}}',
  ' '.repeat(1_000_001),
]) {
  test('state factory.hydrate: malformed envelope ' + payload.slice(0, 50) + ' -> rejected before decoding', () => {
    let decoded = false;
    const configured = createStateFactory({ decode() { decoded = true; return null; } });

    expect(() => configured.hydrate(payload)).toThrow();

    expect(decoded).toBe(false);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });
}

const invalidValues = [
  undefined, NaN, Infinity, -0, 1n, Symbol('state'), () => 1,
  new Date(), new Map(), new Set(), { missing: undefined }, [undefined], Array(1),
  Object.assign([1], { extra: 2 }), { toJSON: () => ({ count: 1 }) },
  Object.defineProperty({}, 'hidden', { value: 1 }),
  { [Symbol('hidden')]: 1 },
];
for (const [index, invalid] of invalidValues.entries()) {
  test('state factory.create: non-JSON input ' + index + ' -> refuses silent JSON loss', () => {
    const configured = createStateFactory({ decode: (input: unknown) => input });

    expect(() => configured.create(invalid)).toThrow(TypeError);
  });
}

test('state factory.create: accessors, cycles, and excessive depth -> bounded rejection without invoking getters', () => {
  let getterCalls = 0;
  const accessor = { get count() { getterCalls++; return 1; } };
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  let deep: unknown = null;
  for (let index = 0; index < 66; index++) deep = { nested: deep };
  const configured = createStateFactory({ decode: (input: unknown) => input });

  for (const invalid of [accessor, cycle, deep]) expect(() => configured.create(invalid)).toThrow(TypeError);

  expect(getterCalls).toBe(0);
});

test('state factory.create: repeated object references -> JSON copies are accepted without a false cycle', () => {
  const shared = { count: 1 };
  const configured = createStateFactory({ decode: (input: unknown) => input });

  const store = configured.create([shared, shared]);

  expect(store.getState()).toEqual([{ count: 1 }, { count: 1 }]);
});

test('state factory.serialize: escape expansion exceeds transfer limit -> rejects a payload the client cannot accept', () => {
  const store = factory.create({ count: 1, label: '<'.repeat(170_000) });

  expect(() => factory.serialize(store)).toThrow('length limit');
});

test('state factory.create: invalid decoder output -> refuses non-JSON state after validation', () => {
  const configured = createStateFactory({ decode: () => new Date() });

  expect(() => configured.create(null)).toThrow(TypeError);
});

test('state factory.hydrate: decoder changes canonical data -> fails before constructing a mismatched client store', () => {
  let constructions = 0;
  const configured = createStateFactory({
    decode(input: unknown) {
      const state = decode(input);
      return { ...state, count: state.count + 1 };
    },
    create(initial) { constructions++; return createStore(initial); },
  });
  const server = configured.create({ count: 1, label: 'server' });

  expect(() => configured.hydrate(configured.serialize(server))).toThrow('preserve the transferred');

  expect(constructions).toBe(1);
});

test('state factory.hydrate: valid data altered within the domain -> accepts validated input without claiming authenticity', () => {
  const store = factory.hydrate('{"version":1,"state":{"count":3,"label":"client"}}');

  expect(store.getInitialState()).toEqual({ count: 3, label: 'client' });
});

test('state factory.create: singleton factory -> refuses reuse across requests', () => {
  const singleton = createStore({ count: 1, label: 'shared' });
  const configured = createStateFactory({ decode, create: () => singleton });
  configured.create({ count: 1, label: 'shared' });

  expect(() => configured.create({ count: 2, label: 'other' })).toThrow('fresh store');
});

test('state factory: persisted store hydration -> SSR state precedes explicit storage rehydration', async () => {
  const storage = new AsyncMemoryStorage();
  storage.value = { state: { count: 7 }, version: 0 };
  let storageCalls = 0;
  const configured = createStateFactory({
    decode(input: unknown) {
      const decoded = decodeCounter(input);
      if (!decoded) throw new TypeError('Invalid counter');
      return decoded;
    },
    create: initial => pipe.use(persist({
      key: 'counter', decode: decodeCounter,
      storage: () => { storageCalls++; return storage; },
    })).create(initial),
  });
  const server = configured.create({ count: 1 });

  const client = configured.hydrate(configured.serialize(server));

  expect(storageCalls).toBe(0);
  expect(client.getInitialState()).toEqual({ count: 1 });
  expect(client.persist.getStatus().hydration).toBe('idle');
  await client.persist.rehydrate();
  expect(client.getState()).toEqual({ count: 7 });
  expect(client.getInitialState()).toEqual({ count: 1 });
  expect(storageCalls).toBe(1);
});
