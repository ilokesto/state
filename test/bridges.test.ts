import { expect, test } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/query-core';
import { createActor, createMachine, fromTransition } from 'xstate';
import { fileURLToPath } from 'node:url';
import {
  createActorBridge, createQueryBridge, createUrlBridge,
  type ActorSource, type UrlCodec, type UrlEnvironment,
} from '../src/index';
import { compileTypeFiles } from './helpers/compileTypeFiles';

test('query bridge: cache changed before subscribing -> catches up with the exact observer result', () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(['counter'], 1);
  const observer = new QueryObserver<number>(client, { queryKey: ['counter'], enabled: false });
  const initial = observer.getCurrentResult();
  client.setQueryData(['counter'], 2);

  const bridge = createQueryBridge(observer);

  expect(bridge.store.getInitialState()).toBe(initial);
  expect(bridge.store.getState()).toBe(observer.getCurrentResult());
  expect(bridge.store.getState().data).toBe(2);
  expect('set' in bridge.store).toBe(false);
  bridge.dispose();
  client.clear();
});

test('query bridge: shared borrowed observer -> selectors update and disposal leaves other consumers alive', () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(['counter'], 1);
  const observer = new QueryObserver<number>(client, { queryKey: ['counter'], enabled: false });
  const received: unknown[] = [];
  const unsubscribe = observer.subscribe((result) => received.push(result));
  const first = createQueryBridge(observer);
  const second = createQueryBridge(observer);
  const selected: Array<[number | undefined, number | undefined]> = [];
  first.store.subscribeSelector((result) => result.data, (next, previous) => selected.push([next, previous]));
  client.setQueryData(['counter'], 2);
  const frozen = first.store.getState();
  first.dispose();
  first.dispose();

  client.setQueryData(['counter'], 3);

  expect(selected).toEqual([[2, 1]]);
  expect(first.store.getState()).toBe(frozen);
  expect(second.store.getState()).toBe(observer.getCurrentResult());
  expect(second.store.getState().data).toBe(3);
  expect(received.at(-1)).toBe(observer.getCurrentResult());
  second.dispose();
  expect(observer.hasListeners()).toBe(true);
  unsubscribe();
  client.clear();
});

test('query bridge: real refetch success and failure -> mirrors query-owned status and error', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const failure = new Error('query failed');
  let shouldFail = false;
  const observer = new QueryObserver(client, {
    queryKey: ['fetch'],
    enabled: false,
    queryFn: async () => {
      if (shouldFail) {
        throw failure;
      }
      return { count: 4 };
    },
  });
  const bridge = createQueryBridge(observer);

  await observer.refetch();

  expect(bridge.store.getState()).toBe(observer.getCurrentResult());
  expect(bridge.store.getState().status).toBe('success');
  expect(bridge.store.getState().data).toEqual({ count: 4 });
  shouldFail = true;
  await observer.refetch();
  expect(bridge.store.getState()).toBe(observer.getCurrentResult());
  expect(bridge.store.getState().status).toBe('error');
  expect(bridge.store.getState().error).toBe(failure);
  bridge.dispose();
  client.clear();
});

test('query bridge: silent change during subscribe -> rechecks and ignores callbacks after disposal', () => {
  let current = { count: 0 };
  let notify = () => {};
  let unsubscribed = 0;
  const bridge = createQueryBridge({
    getCurrentResult: () => current,
    subscribe: (listener) => {
      current = { count: 1 };
      notify = () => listener(current);
      return () => { unsubscribed += 1; };
    },
  });
  const caughtUp = bridge.store.getState();
  bridge.dispose();
  current = { count: 2 };

  notify();
  bridge.refresh();

  expect(caughtUp.count).toBe(1);
  expect(bridge.store.getState()).toBe(caughtUp);
  expect(unsubscribed).toBe(1);
});

test('query bridge: failed post-subscribe read -> releases its acquired subscription', () => {
  let reads = 0;
  let unsubscribed = 0;

  expect(() => createQueryBridge({
    getCurrentResult: () => {
      if (++reads === 2) {
        throw new Error('unreadable');
      }
      return 0;
    },
    subscribe: () => () => { unsubscribed += 1; },
  })).toThrow('unreadable');

  expect(unsubscribed).toBe(1);
});

test('actor bridge: real transition actor -> preserves snapshot identity and typed event delivery', () => {
  const actor = createActor(fromTransition(
    (state: number, event: { type: 'add'; amount: number }) => state + event.amount,
    0,
  ));
  const bridge = createActorBridge(actor);
  const initial = actor.getSnapshot();
  let updates = 0;
  bridge.store.subscribe(() => { updates += 1; });
  actor.start();

  bridge.send({ type: 'add', amount: 3 });

  expect(bridge.store.getInitialState()).toBe(initial);
  expect(bridge.store.getState()).toBe(actor.getSnapshot());
  expect(bridge.store.getState().context).toBe(3);
  expect(updates).toBe(1);
  bridge.dispose();
  actor.stop();
});

test('actor bridge: disposing one mirror -> borrowed actor and second mirror remain active', () => {
  const actor = createActor(fromTransition((state: number, _event: { type: 'add' }) => state + 1, 0));
  actor.start();
  const first = createActorBridge(actor);
  const second = createActorBridge(actor);
  const frozen = first.store.getState();
  first.dispose();
  first.dispose();

  second.send({ type: 'add' });

  expect(first.store.getState()).toBe(frozen);
  expect(second.store.getState()).toBe(actor.getSnapshot());
  expect(actor.getSnapshot().context).toBe(1);
  expect(actor.getSnapshot().status).toBe('active');
  expect(() => first.send({ type: 'add' })).toThrow('disposed');
  second.dispose();
  actor.stop();
});

test('actor bridge: final machine transition -> mirrors the exact done snapshot', () => {
  const actor = createActor(createMachine({
    initial: 'running',
    states: { running: { on: { finish: 'done' } }, done: { type: 'final' } },
  }));
  actor.start();
  const bridge = createActorBridge(actor);

  bridge.send({ type: 'finish' });

  expect(bridge.store.getState()).toBe(actor.getSnapshot());
  expect(bridge.store.getState().status).toBe('done');
  bridge.dispose();
});

test('actor bridge: actor error -> mirrors the error snapshot without an unhandled observer error', () => {
  const failure = new Error('transition failed');
  const actor = createActor(fromTransition((_state: number, _event: { type: 'fail' }) => {
    throw failure;
  }, 0));
  const bridge = createActorBridge(actor);
  actor.start();

  bridge.send({ type: 'fail' });

  expect(bridge.store.getState()).toBe(actor.getSnapshot());
  expect(bridge.store.getState().status).toBe('error');
  expect(bridge.store.getState().error).toBe(failure);
  bridge.dispose();
});

test('actor bridge: silent subscribe change and bound methods -> catches up without stopping the source', () => {
  let count = 0;
  let unsubscribed = 0;
  const source: ActorSource<number, { type: 'add' }> = {
    getSnapshot() { expect(this).toBe(source); return count; },
    subscribe() {
      expect(this).toBe(source);
      count = 1;
      return { unsubscribe() { unsubscribed += 1; } };
    },
    send() { expect(this).toBe(source); count += 1; },
  };

  const bridge = createActorBridge(source);

  expect(bridge.store.getState()).toBe(1);
  bridge.send({ type: 'add' });
  bridge.refresh();
  expect(bridge.store.getState()).toBe(2);
  bridge.dispose();
  expect(unsubscribed).toBe(1);
});

const pageCodec: UrlCodec<number> = {
  parse(value) {
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new Error('Invalid page');
    }
    return Number(value);
  },
  serialize: (value) => value === 1 ? null : String(value),
};

function urlEnvironment(href: string) {
  const listeners = new Set<() => void>();
  const writes: Array<{ mode: string; state: unknown; url: string }> = [];
  const location = { href };
  const state = { router: 'owned' };
  const environment: UrlEnvironment = {
    location,
    history: {
      state,
      pushState(state, _unused, url) {
        writes.push({ mode: 'push', state, url });
        location.href = url;
      },
      replaceState(state, _unused, url) {
        writes.push({ mode: 'replace', state, url });
        location.href = url;
      },
    },
    addEventListener: (_type, listener) => { listeners.add(listener); },
    removeEventListener: (_type, listener) => { listeners.delete(listener); },
  };
  return {
    environment, location, writes, listeners,
    popstate: () => { for (const listener of listeners) { listener(); } },
  };
}

for (const suffix of ['', '?page=', '?page=garbage', '?page=%E0%A4%A', '?page=0']) {
  test(`URL bridge: missing or malformed input ${suffix} -> uses default without rewriting URL`, () => {
    const fixture = urlEnvironment(`https://example.test/path${suffix}`);

    const bridge = createUrlBridge({ key: 'page', codec: pageCodec, defaultValue: 1, environment: fixture.environment });

    expect(bridge.store.getState()).toBe(1);
    expect(fixture.writes).toEqual([]);
    expect(fixture.environment.location.href).toBe(`https://example.test/path${suffix}`);
    bridge.dispose();
  });
}

test('URL bridge: SSR without globals or environment -> parses injected URL and writes only local state', () => {
  const url = new URL('https://example.test/?page=2&page=3');
  const bridge = createUrlBridge({ key: 'page', codec: pageCodec, defaultValue: 1, url });
  const defaultBridge = createUrlBridge({ key: 'page', codec: pageCodec, defaultValue: 1 });

  bridge.set(4);

  expect(bridge.store.getInitialState()).toBe(2);
  expect(bridge.store.getState()).toBe(4);
  expect(defaultBridge.store.getState()).toBe(1);
  expect(url.search).toBe('?page=2&page=3');
  bridge.dispose();
  defaultBridge.dispose();
});

test('URL bridge: push replace removal and popstate -> preserves unrelated URL and history state', () => {
  const fixture = urlEnvironment('https://example.test/path?keep=yes&page=2#section');
  const bridge = createUrlBridge({ key: 'page', codec: pageCodec, defaultValue: 1, environment: fixture.environment });
  const seen: number[] = [];
  bridge.store.subscribe(() => seen.push(bridge.store.getState()));

  bridge.set(3);
  bridge.set(4, 'push');
  bridge.set(1);
  fixture.location.href = 'https://example.test/path?keep=yes&page=2#section';
  fixture.popstate();

  expect(seen).toEqual([3, 4, 1, 2]);
  expect(fixture.writes.map(write => write.mode)).toEqual(['replace', 'push', 'replace']);
  expect(fixture.writes.map(write => write.url)).toEqual([
    'https://example.test/path?keep=yes&page=3#section',
    'https://example.test/path?keep=yes&page=4#section',
    'https://example.test/path?keep=yes#section',
  ]);
  expect(fixture.writes.every(write => write.state === fixture.environment.history.state)).toBe(true);
  bridge.dispose();
});

test('URL bridge: registration changes the URL silently -> post-subscribe read closes the gap', () => {
  const fixture = urlEnvironment('https://example.test/?page=2');
  const add = fixture.environment.addEventListener;
  fixture.environment.addEventListener = (type, listener) => {
    fixture.location.href = 'https://example.test/?page=3';
    add(type, listener);
  };

  const bridge = createUrlBridge({ key: 'page', codec: pageCodec, defaultValue: 1, environment: fixture.environment });

  expect(bridge.store.getInitialState()).toBe(2);
  expect(bridge.store.getState()).toBe(3);
  bridge.dispose();
});

test('URL bridge: codec or history write fails -> keeps the previous snapshot and URL', () => {
  const fixture = urlEnvironment('https://example.test/?page=2');
  const bridge = createUrlBridge({ key: 'page', codec: pageCodec, defaultValue: 1, environment: fixture.environment });
  const before = bridge.store.getState();

  expect(() => bridge.set(-1)).toThrow('Invalid page');
  fixture.environment.history.replaceState = () => { throw new Error('History denied'); };
  expect(() => bridge.set(3)).toThrow('History denied');

  expect(bridge.store.getState()).toBe(before);
  expect(fixture.environment.location.href).toBe('https://example.test/?page=2');
  expect(fixture.writes).toEqual([]);
  bridge.dispose();
});

test('URL bridge: disposal -> removes popstate listener and rejects writes', () => {
  const fixture = urlEnvironment('https://example.test/?page=2');
  const bridge = createUrlBridge({ key: 'page', codec: pageCodec, defaultValue: 1, environment: fixture.environment });
  bridge.dispose();
  bridge.dispose();
  fixture.location.href = 'https://example.test/?page=3';

  fixture.popstate();
  bridge.refresh();

  expect(fixture.listeners.size).toBe(0);
  expect(bridge.store.getState()).toBe(2);
  expect(() => bridge.set(4)).toThrow('disposed');
  expect(fixture.writes).toEqual([]);
});

test('bridges: public declarations -> preserve snapshot, event, codec and readonly contracts', () => {
  const fixture = fileURLToPath(new URL('./fixtures/bridge-types.ts', import.meta.url));

  const compiled = compileTypeFiles([fixture]);

  expect(compiled.exitCode, compiled.diagnostics).toBe(0);
});
