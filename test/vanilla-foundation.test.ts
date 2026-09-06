import { expect, test } from 'bun:test';
import { Store, type StoreApi } from '@ilokesto/store';
import * as state from '../src/index';
import * as react from '../src/core/React';
import * as svelte from '../src/core/Svelte';
import { getStoreActionMetadata } from '../src/lib/actionMetadata';
import { compileTypeFiles } from './helpers/compileTypeFiles';
import { fileURLToPath } from 'node:url';

test('Given vanilla state, when bound to two frameworks, then both share the same store', () => {
  const store = state.createStore({ count: 0 });
  const reactState = react.bind(store);
  const svelteState = svelte.bind(store);
  const received: number[] = [];
  const unsubscribe = svelteState.select((value) => value.count).subscribe((value) => received.push(value));

  reactState.writeOnly()({ count: 1 });

  expect(store.getState()).toEqual({ count: 1 });
  expect(svelteState.readOnly()).toEqual({ count: 1 });
  expect(received).toEqual([0, 1]);
  unsubscribe();
});

test('Given a structural store, when explicitly bound, then no instanceof recognition is needed', () => {
  const owned = new Store(0);
  const external: StoreApi<number> = {
    getState: () => owned.getState(),
    getInitialState: () => owned.getInitialState(),
    subscribe: (listener) => owned.subscribe(listener),
    subscribeSelector: (selector, listener, equality) => owned.subscribeSelector(selector, listener, equality),
    setState: (value) => owned.setState(value),
    set: (value) => owned.set(value),
    update: (updater) => owned.update(updater),
    pushMiddleware: (middleware) => owned.pushMiddleware(middleware),
    unshiftMiddleware: (middleware) => owned.unshiftMiddleware(middleware),
  };
  const adapter = svelte.bind(external);

  adapter.update((value) => value + 1);

  expect(owned.getState()).toBe(1);
  expect(state.createStore(external).getState()).toBe(external);
});

test('Given a reducer handle, when shared across bindings, then actions reduce once with scoped metadata', () => {
  type Action = { readonly type: 'add'; readonly amount: number };
  let reductions = 0;
  const reducer = (value: number, action: Action) => {
    reductions += 1;
    return value + action.amount;
  };
  const handle = state.createReducer(reducer, 0);
  const a = react.bindReducer(handle);
  const b = svelte.bindReducer(handle);
  const metadata: Array<string | undefined> = [];
  handle.store.pushMiddleware((value, next) => {
    metadata.push(getStoreActionMetadata(handle.store)?.type);
    next(value);
  });

  a.writeOnly()({ type: 'add', amount: 2 });

  expect(b.readOnly()).toBe(2);
  expect(reductions).toBe(1);
  expect(metadata).toEqual(['add']);
  expect(getStoreActionMetadata(handle.store)).toBeUndefined();
  handle.store.set(7);
  expect(reductions).toBe(1);
  expect(b.readOnly()).toBe(7);
});

test('Given function-valued state, when Svelte set replaces it, then the function is not invoked', () => {
  let calls = 0;
  const original = () => 1;
  const replacement = () => { calls += 1; return 2; };
  const store = state.createStore(original);
  const adapter = svelte.bind(store);

  adapter.set(replacement);

  expect(calls).toBe(0);
  expect(store.getState()).toBe(replacement);
  expect(adapter.readOnly()()).toBe(2);
});

test('Given undefined reducer state, when dispatched, then argument arity never changes its meaning', () => {
  const handle = state.createReducer(
    (_value: number | undefined, action: { readonly type: 'set'; readonly value: number }) => action.value,
    undefined,
  );

  handle.dispatch({ type: 'set', value: 4 });

  expect(handle.store.getInitialState()).toBeUndefined();
  expect(handle.store.getState()).toBe(4);
});

test('Given callable reducer state, when a reducer replaces or retains it, then no function is invoked', () => {
  let calls = 0;
  let notifications = 0;
  const original = () => 1;
  const replacement = () => { calls += 1; return 2; };
  const handle = state.createReducer(
    (_value: () => number, _action: { readonly type: 'replace' }) => replacement,
    original,
  );
  handle.store.subscribe(() => { notifications += 1; });

  handle.dispatch({ type: 'replace' });
  handle.dispatch({ type: 'replace' });

  expect(calls).toBe(0);
  expect(handle.store.getState()).toBe(replacement);
  expect(handle.store.getInitialState()).toBe(original);
  expect(notifications).toBe(1);
});

test('Given a capability-bearing Store, when createReducer types are consumed, then its controls remain available', () => {
  const fixture = fileURLToPath(new URL('./fixtures/vanilla-capabilities.ts', import.meta.url));

  const compiled = compileTypeFiles([fixture]);

  expect(compiled.exitCode, compiled.diagnostics).toBe(0);
});
