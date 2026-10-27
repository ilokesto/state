import { expect, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { PipeConfigurationError } from '../../src/utils/pipe/errors';
import { definePipeableMiddleware, getPipeableMiddlewareMetadata } from '../../src/utils/pipe/metadata';
import type { PipeCapability } from '../../src/utils/pipe/types';

type SnapshotMetadata = {
  readonly adds: readonly string[];
  readonly after: readonly string[];
  readonly before: readonly string[];
  readonly conflicts: readonly string[];
  readonly duplicate: 'allow' | 'reject';
  readonly id: string;
  readonly requires: readonly string[];
};

type CounterState = {
  readonly count: number;
};

type ClockCapability = PipeCapability<'@test/clock', { readonly now: () => number }>;

function isSnapshotMetadata(value: unknown): value is SnapshotMetadata {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'duplicate' in value &&
    'before' in value &&
    'conflicts' in value &&
    'after' in value &&
    'requires' in value &&
    'adds' in value &&
    typeof value.id === 'string' &&
    (value.duplicate === 'allow' || value.duplicate === 'reject') &&
    Array.isArray(value.before) &&
    Array.isArray(value.conflicts) &&
    Array.isArray(value.after) &&
    Array.isArray(value.requires) &&
    Array.isArray(value.adds)
  );
}

function getSnapshotMetadata(middleware: object): SnapshotMetadata {
  const metadata = getPipeableMiddlewareMetadata(middleware);
  if (!isSnapshotMetadata(metadata)) {
    throw new TypeError('Expected hidden pipe middleware metadata');
  }

  return metadata;
}

function copyOwnProperties(source: object, target: object): void {
  for (const key of Reflect.ownKeys(source)) {
    const sourceDescriptor = Object.getOwnPropertyDescriptor(source, key);
    const targetDescriptor = Object.getOwnPropertyDescriptor(target, key);
    if (sourceDescriptor === undefined || targetDescriptor?.configurable === false) {
      continue;
    }

    const descriptor = isSnapshotMetadata(sourceDescriptor.value)
      ? {
          ...sourceDescriptor,
          value: Object.freeze({ ...sourceDescriptor.value, id: '@test/forged' }),
        }
      : sourceDescriptor;
    Object.defineProperty(target, key, descriptor);
  }
}

function expectInvalidMetadata(action: () => void, ids: readonly string[]): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PipeConfigurationError);
    if (error instanceof PipeConfigurationError) {
      expect(error.code).toBe('INVALID_METADATA');
      expect(error.id).toBe(ids[0] ?? '');
      expect(error.ids).toEqual(ids);
      expect(Object.isFrozen(error.ids)).toBe(true);
      return;
    }

    throw error;
  }

  throw new TypeError('Expected invalid metadata to throw');
}

test('Given pipe middleware metadata, when it is registered, then it preserves literal metadata and freezes snapshots', () => {
  // Given
  const before = ['@test/inner'];
  const after = ['@test/outer'];
  const requires: ClockCapability[] = [{ id: '@test/clock', shape: { now: () => 1 } }];
  const conflicts = ['@test/conflict'];
  const middleware = <State>(store: Store<State>): Store<State> => store;

  // When
  const defined = definePipeableMiddleware(middleware, {
    after,
    before,
    conflicts,
    duplicate: 'allow',
    id: '@test/middleware',
    requires,
  });
  before.push('@test/mutated-before');
  after.push('@test/mutated-after');
  requires.push({ id: '@test/clock', shape: { now: () => 2 } });
  conflicts.push('@test/mutated-conflict');
  const snapshot = getSnapshotMetadata(defined);

  // Then
  expect(Object.is(defined, middleware)).toBe(true);
  expect(Object.keys(defined)).toEqual([]);
  expect(Object.getOwnPropertyNames(defined)).not.toContain('metadata');
  expect(Object.getOwnPropertySymbols(defined)).toEqual([]);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.before)).toBe(true);
  expect(Object.isFrozen(snapshot.conflicts)).toBe(true);
  expect(Object.isFrozen(snapshot.after)).toBe(true);
  expect(Object.isFrozen(snapshot.requires)).toBe(true);
  expect(Object.isFrozen(snapshot.adds)).toBe(true);
  expect(snapshot.id).toBe('@test/middleware');
  expect(snapshot.duplicate).toBe('allow');
  expect(snapshot.before).toEqual(['@test/inner']);
  expect(snapshot.conflicts).toEqual(['@test/conflict']);
  expect(snapshot.after).toEqual(['@test/outer']);
  expect(snapshot.requires).toEqual(['@test/clock']);
  expect(snapshot.adds).toEqual([]);
});

test('Given tagged middleware, when every discoverable property is copied to an impostor, then forged metadata is rejected', () => {
  // Given
  const tagged = definePipeableMiddleware(
    <State>(store: Store<State>): Store<State> => store,
    { id: '@test/tagged' },
  );
  const impostor = <State>(store: Store<State>): Store<State> => store;

  // When
  copyOwnProperties(tagged, impostor);

  // Then
  expect(getPipeableMiddlewareMetadata(impostor)).toBeUndefined();
});

test('Given identical middleware metadata, when the same middleware is registered again, then registration is idempotent', () => {
  // Given
  const middleware = <State>(store: Store<State>): Store<State> => store;
  const metadata = { conflicts: ['@test/conflict'], id: '@test/idempotent' } as const;

  // When
  const first = definePipeableMiddleware(middleware, metadata);
  const second = definePipeableMiddleware(middleware, metadata);

  // Then
  expect(second).toBe(first);
  expect(getSnapshotMetadata(second).id).toBe('@test/idempotent');
  expectInvalidMetadata(
    () => definePipeableMiddleware(middleware, {
      conflicts: ['@test/different-conflict'],
      id: '@test/idempotent',
    }),
    ['@test/idempotent', '@test/idempotent'],
  );
});

test('Given malformed pipe middleware metadata, when it is registered, then it rejects malformed metadata', () => {
  // Given
  let executions = 0;
  const stateSpecificMiddleware = (store: Store<CounterState>): Store<CounterState> => {
    executions += 1;
    return store;
  };
  const duplicateCapability = { id: '@test/capability', shape: {} } as const;

  // When / Then
  expectInvalidMetadata(
    () => definePipeableMiddleware(stateSpecificMiddleware, { id: '' }),
    [],
  );
  expectInvalidMetadata(
    () => definePipeableMiddleware(stateSpecificMiddleware, { before: ['@test/self'], id: '@test/self' }),
    ['@test/self'],
  );
  expectInvalidMetadata(
    () => definePipeableMiddleware(stateSpecificMiddleware, { after: ['@test/self'], id: '@test/self' }),
    ['@test/self'],
  );
  expectInvalidMetadata(
    () => definePipeableMiddleware(stateSpecificMiddleware, { conflicts: ['@test/self'], id: '@test/self' }),
    ['@test/self'],
  );
  expectInvalidMetadata(
    () => definePipeableMiddleware(stateSpecificMiddleware, { before: ['@test/a', '@test/a'], id: '@test/duplicate-before' }),
    ['@test/a'],
  );
  expectInvalidMetadata(
    () => definePipeableMiddleware(stateSpecificMiddleware, { after: ['@test/a', '@test/a'], id: '@test/duplicate-after' }),
    ['@test/a'],
  );
  expectInvalidMetadata(
    () => definePipeableMiddleware(stateSpecificMiddleware, {
      conflicts: ['@test/a', '@test/a'],
      id: '@test/duplicate-conflict',
    }),
    ['@test/a'],
  );
  expectInvalidMetadata(
    () => definePipeableMiddleware(stateSpecificMiddleware, {
      id: '@test/duplicate-requires',
      requires: [duplicateCapability, duplicateCapability],
    }),
    ['@test/capability'],
  );
  expectInvalidMetadata(
    () => definePipeableMiddleware(stateSpecificMiddleware, {
      adds: [duplicateCapability, duplicateCapability],
      id: '@test/duplicate-adds',
    }),
    ['@test/capability'],
  );
  let capabilityIdReads = 0;
  const unstableCapability = {
    get id(): string {
      capabilityIdReads += 1;
      return capabilityIdReads === 1 ? '@test/declared' : '@test/observed';
    },
    shape: {},
  };
  expectInvalidMetadata(
    () => definePipeableMiddleware(stateSpecificMiddleware, {
      id: '@test/unstable-capability',
      requires: [unstableCapability],
    }),
    ['@test/declared', '@test/observed'],
  );
  expect(executions).toBe(0);
});
