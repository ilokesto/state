import { expect, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { PipeConfigurationError } from '../../src/utils/pipe/errors';
import { definePipeableMiddleware } from '../../src/utils/pipe/metadata';
import { validatePipeMiddlewareAppend, validatePipeMiddlewareChain } from '../../src/utils/pipe/validation';
import type { PipeAnyMiddleware, PipeCapability } from '../../src/utils/pipe/types';

type CounterState = {
  readonly count: number;
};

type ApiCapability = PipeCapability<'@test/api', { readonly api: () => number }>;

function createApiProvider(result: number): PipeAnyMiddleware<readonly [], readonly [ApiCapability]> {
  return <State>(store: Store<State>) => Object.assign(store, { api: () => result });
}

const apiConsumer: PipeAnyMiddleware<readonly [ApiCapability]> = <State>(store: Store<State> & { readonly api: () => number }) => {
  store.api();
  return store;
};

function expectConfigurationError(action: () => void, code: PipeConfigurationError['code'], ids: readonly string[]): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PipeConfigurationError);
    if (error instanceof PipeConfigurationError) {
      expect(error.code).toBe(code);
      expect(error.ids).toEqual(ids);
      return;
    }

    throw error;
  }

  throw new TypeError('Expected pipe chain validation to throw');
}

test('Given capability providers and consumers, when requirements precede consumers, then it accumulates capabilities and stable state', () => {
  // Given
  const provider = definePipeableMiddleware(createApiProvider(42), {
    adds: [{ id: '@test/api', shape: { api: () => 42 } }],
    id: '@test/provider',
  });
  const consumer = definePipeableMiddleware(apiConsumer, {
    id: '@test/consumer',
    requires: [{ id: '@test/api', shape: { api: () => 0 } }],
  });
  const initialStore = new Store<CounterState>({ count: 0 });

  // When
  validatePipeMiddlewareChain([provider, consumer]);
  const storeWithApi = provider(initialStore);
  consumer(storeWithApi);

  // Then
  expect(storeWithApi.api()).toBe(42);
  expect(storeWithApi.getState()).toEqual({ count: 0 });
});

test('Given unavailable or duplicated capabilities, when a chain is validated, then it rejects unavailable capabilities', () => {
  // Given
  const consumer = definePipeableMiddleware(apiConsumer, {
    id: '@test/consumer',
    requires: [{ id: '@test/api', shape: { api: () => 0 } }],
  });
  const providerOne = definePipeableMiddleware(createApiProvider(1), {
    adds: [{ id: '@test/api', shape: { api: () => 1 } }],
    id: '@test/provider-one',
  });
  const providerTwo = definePipeableMiddleware(createApiProvider(2), {
    adds: [{ id: '@test/api', shape: { api: () => 2 } }],
    id: '@test/provider-two',
  });

  // When / Then
  expectConfigurationError(
    () => validatePipeMiddlewareAppend([], consumer),
    'MISSING_CAPABILITY',
    ['@test/consumer', '@test/api'],
  );
  expectConfigurationError(
    () => validatePipeMiddlewareChain([providerOne, providerTwo]),
    'DUPLICATE_CAPABILITY',
    ['@test/api'],
  );
});
