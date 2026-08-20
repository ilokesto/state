import { expect, test } from 'bun:test';

import { validate } from '../src/middleware/validate';
import { PipeConfigurationError } from '../src/utils/pipe/errors';
import { pipe } from '../src/utils/pipe';

type CounterState = {
  readonly count: number;
};

function isCounterState(value: unknown): value is CounterState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'count' in value &&
    typeof value.count === 'number'
  );
}

const counterSchema = {
  '~standard': {
    validate: (value: unknown) =>
      isCounterState(value) && value.count >= 0
        ? { value }
        : { issues: [{ message: 'count must be a non-negative number' }] },
    vendor: 'test',
    version: 1 as const,
  },
} as const;

const asyncCounterSchema = {
  '~standard': {
    validate: async (value: unknown) =>
      isCounterState(value)
        ? { value }
        : { issues: [{ message: 'count must be a number' }] },
    vendor: 'test',
    version: 1 as const,
  },
} as const;

test('Given pipe validate middleware, when valid state is applied, then it preserves validate pipe contracts', () => {
  // Given
  const pipeStore = pipe.use(validate(counterSchema)).create({ count: 0 });

  // When
  pipeStore.setState((previous) => ({ count: previous.count + 1 }));

  // Then
  expect(pipeStore.getState()).toEqual({ count: 1 });
});

test('Given pipe validate middleware, when an update is invalid or async, then it leaves the Store state unchanged', () => {
  // Given
  const asyncStore = pipe.use(validate(asyncCounterSchema)).create({ count: 1 });
  const pipeStore = pipe.use(validate(counterSchema)).create({ count: 1 });

  // When
  asyncStore.setState({ count: 2 });
  pipeStore.setState({ count: -1 });

  // Then
  expect(asyncStore.getState()).toEqual({ count: 1 });
  expect(pipeStore.getState()).toEqual({ count: 1 });
});

test('Given pipe validate middleware with custom onError, when an update is invalid, then onError receives the issues', () => {
  // Given
  const receivedIssues: string[] = [];
  const store = pipe
    .use(validate(counterSchema, { onError: (issues) => { receivedIssues.push(issues[0]?.message ?? ''); } }))
    .create({ count: 1 });

  // When
  store.setState({ count: -1 });

  // Then
  expect(receivedIssues).toEqual(['count must be a non-negative number']);
  expect(store.getState()).toEqual({ count: 1 });
});

test('Given pipe validate middleware with throwing onError, when an update is invalid, then the error propagates', () => {
  // Given
  const store = pipe
    .use(validate(counterSchema, { onError: () => { throw new Error('rejected'); } }))
    .create({ count: 1 });

  // When / Then
  expect(() => store.setState({ count: -1 })).toThrow('rejected');
  expect(store.getState()).toEqual({ count: 1 });
});

test('Given pipe validate middleware with custom onError, when an async schema is used, then onError is called with a synthetic issue', () => {
  // Given
  const receivedIssues: string[] = [];
  const store = pipe
    .use(validate(asyncCounterSchema, { onError: (issues) => { receivedIssues.push(issues[0]?.message ?? ''); } }))
    .create({ count: 1 });

  // When
  store.setState({ count: 2 });

  // Then
  expect(receivedIssues.length).toBe(1);
  expect(receivedIssues[0]).toContain('Async');
  expect(store.getState()).toEqual({ count: 1 });
});

test('Given curried validate middleware, when it is appended twice, then it rejects the duplicate before Store creation', () => {
  // Given
  const builder = pipe.use(validate(counterSchema));
  const appendDuplicate = () => Reflect.apply(builder.use, builder, [validate(counterSchema)]);

  // When / Then
  expect(appendDuplicate).toThrow(PipeConfigurationError);
  expect(appendDuplicate).toThrow(
    expect.objectContaining({ code: 'DUPLICATE_MIDDLEWARE', ids: ['@ilokesto/state/validate'] }),
  );
});
