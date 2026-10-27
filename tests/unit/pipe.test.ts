import { expect, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { pipe } from '../../src/utils/pipe';
import { PipeConfigurationError } from '../../src/utils/pipe/errors';
import { definePipeableMiddleware } from '../../src/utils/pipe/metadata';

function asObject(value: unknown, label: string): object {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    throw new TypeError(`${label} must be an object`);
  }

  return value;
}

function method(value: object, key: string): Function {
  const candidate: unknown = Reflect.get(value, key);
  if (typeof candidate !== 'function') {
    throw new TypeError(`${key} must be a function`);
  }

  return candidate;
}

function use(value: object, middleware: object): object {
  return asObject(Reflect.apply(method(value, 'use'), value, [middleware]), 'pipe builder');
}

function create(value: object, initialState: unknown): Store<unknown> {
  const result: unknown = Reflect.apply(method(value, 'create'), value, [initialState]);
  if (!(result instanceof Store)) {
    throw new TypeError('Pipe builder create must return a Store');
  }

  return result;
}

function expectPipeConfigurationError(action: () => void, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PipeConfigurationError);
    if (error instanceof PipeConfigurationError) {
      expect(error).toMatchObject({ code });
      return;
    }

    throw error;
  }

  throw new TypeError('Expected pipe configuration error');
}

test('Given the pipe root, when it is inspected, then it is a frozen builder-only root', () => {
  // Given
  const root = asObject(pipe, 'pipe root');

  // When / Then
  expect(Object.keys(root)).toEqual(['use']);
  expect(Object.isFrozen(root)).toBe(true);
  expect(typeof root).toBe('object');
  expect(Reflect.has(root, 'create')).toBe(false);
});

test('Given two pipe middleware, when the builder creates a Store, then it preserves left-to-right setup and first-use-outermost nesting', () => {
  // Given
  const trace: string[] = [];
  const first = definePipeableMiddleware((store: Store<{ readonly count: number }>) => {
    trace.push('first:setup');
    store.pushMiddleware((nextState, next) => {
      trace.push('first:before');
      next(nextState);
      trace.push('first:after');
    });
    return store;
  }, { id: '@test/first' } as const);
  const second = definePipeableMiddleware((store: Store<{ readonly count: number }>) => {
    trace.push('second:setup');
    store.pushMiddleware((nextState, next) => {
      trace.push('second:before');
      next(nextState);
      trace.push('second:after');
    });
    return store;
  }, { id: '@test/second' } as const);

  // When
  const firstBuilder = use(asObject(pipe, 'pipe root'), first);
  const builder = use(firstBuilder, second);
  const store = create(builder, { count: 0 });
  store.setState({ count: 1 });

  // Then
  expect(Object.keys(firstBuilder)).toEqual(['use', 'create']);
  expect(Object.keys(builder)).toEqual(['use', 'create']);
  expect(Object.isFrozen(firstBuilder)).toBe(true);
  expect(Object.isFrozen(builder)).toBe(true);
  expect(trace).toEqual([
    'first:setup',
    'second:setup',
    'first:before',
    'second:before',
    'second:after',
    'first:after',
  ]);
});

test('Given a branched pipe builder, when each branch and one branch twice creates a Store, then each creation keeps an independent immutable chain snapshot', () => {
  // Given
  const trace: string[] = [];
  const outer = definePipeableMiddleware((store: Store<{ readonly count: number }>) => {
    trace.push('outer:setup');
    return store;
  }, { id: '@test/outer' } as const);
  const left = definePipeableMiddleware((store: Store<{ readonly count: number }>) => {
    trace.push('left:setup');
    return store;
  }, { id: '@test/left' } as const);
  const right = definePipeableMiddleware((store: Store<{ readonly count: number }>) => {
    trace.push('right:setup');
    return store;
  }, { id: '@test/right' } as const);
  const root = asObject(pipe, 'pipe root');
  const base = use(root, outer);
  const leftBuilder = use(base, left);
  const rightBuilder = use(base, right);

  // When
  const firstLeftStore = create(leftBuilder, { count: 1 });
  const rightStore = create(rightBuilder, { count: 2 });
  const secondLeftStore = create(leftBuilder, { count: 3 });

  // Then
  expect(firstLeftStore).not.toBe(rightStore);
  expect(firstLeftStore).not.toBe(secondLeftStore);
  expect(trace).toEqual([
    'outer:setup',
    'left:setup',
    'outer:setup',
    'right:setup',
    'outer:setup',
    'left:setup',
  ]);
});

test('Given a Store-shaped plain state, when a builder creates it, then it creates a fresh real Store around that state', () => {
  // Given
  const state = {
    getInitialState: () => 'plain initial state',
    getState: () => 'plain current state',
    pushMiddleware: () => undefined,
    setState: () => undefined,
    subscribe: () => () => undefined,
    unshiftMiddleware: () => undefined,
  };
  const middleware = definePipeableMiddleware(<State>(store: Store<State>): Store<State> => store, {
    id: '@test/identity',
  } as const);

  // When
  const store = create(use(asObject(pipe, 'pipe root'), middleware), state);

  // Then
  expect(store).toBeInstanceOf(Store);
  expect(store.getState()).toBe(state);
});

test('Given invalid builder inputs, when use or create receives them, then it fails before middleware setup side effects', () => {
  // Given
  let applications = 0;
  const tagged = definePipeableMiddleware(<State>(store: Store<State>): Store<State> => {
    applications += 1;
    return store;
  }, { id: '@test/tagged' } as const);
  const root = asObject(pipe, 'pipe root');
  const builder = use(root, tagged);
  const untagged = <State>(store: Store<State>): Store<State> => store;

  // When / Then
  expectPipeConfigurationError(() => use(root, untagged), 'INVALID_METADATA');
  expectPipeConfigurationError(() => create(builder, new Store({ count: 0 })), 'INVALID_STORE_INPUT');
  expect(applications).toBe(0);
});

test('Given a builder captures middleware metadata, when conflicting re-registration is attempted, then its branch retains the original metadata policy', () => {
  // Given
  let applications = 0;
  const middleware = <State>(store: Store<State>): Store<State> => {
    applications += 1;
    return store;
  };
  const original = definePipeableMiddleware(middleware, { id: '@test/original' } as const);
  const branch = use(asObject(pipe, 'pipe root'), original);

  // When / Then
  expectPipeConfigurationError(
    () => definePipeableMiddleware(middleware, { id: '@test/replaced' } as const),
    'INVALID_METADATA',
  );
  const duplicate = definePipeableMiddleware(
    <State>(store: Store<State>): Store<State> => store,
    { id: '@test/original' } as const,
  );
  expectPipeConfigurationError(() => use(branch, duplicate), 'DUPLICATE_MIDDLEWARE');
  create(branch, { count: 0 });
  expect(applications).toBe(1);
});

test('Given tagged middleware returning a non-Store, when a builder creates a Store, then it throws immediately without running later middleware', () => {
  // Given
  let invalidRuns = 0;
  let laterRuns = 0;
  const invalidResult = definePipeableMiddleware(<State>(store: Store<State>): Store<State> => {
    invalidRuns += 1;
    Object.setPrototypeOf(store, null);
    return store;
  }, { id: '@test/invalid-result' } as const);
  const later = definePipeableMiddleware(<State>(store: Store<State>): Store<State> => {
    laterRuns += 1;
    return store;
  }, { id: '@test/later' } as const);
  const builder = use(use(asObject(pipe, 'pipe root'), invalidResult), later);

  // When / Then
  expectPipeConfigurationError(() => create(builder, { count: 0 }), 'INVALID_MIDDLEWARE_RESULT');
  expect(invalidRuns).toBe(1);
  expect(laterRuns).toBe(0);
});
