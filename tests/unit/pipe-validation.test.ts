import { expect, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { PipeConfigurationError } from '../../src/utils/pipe/errors';
import { definePipeableMiddleware } from '../../src/utils/pipe/metadata';
import {
  validatePipeMiddlewareAppend,
  validatePipeMiddlewareChain,
} from '../../src/utils/pipe/validation';
import type { PipeMiddlewareMetadata } from '../../src/utils/pipe/types';

function middleware(metadata: PipeMiddlewareMetadata): ReturnType<typeof definePipeableMiddleware> {
  return definePipeableMiddleware(
    <State>(store: Store<State>): Store<State> => store,
    metadata,
  );
}

function expectConfigurationError(
  action: () => void,
  code: PipeConfigurationError['code'],
  ids: readonly string[],
): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PipeConfigurationError);
    if (error instanceof PipeConfigurationError) {
      expect(error.code).toBe(code);
      expect(error.id).toBe(ids[0] ?? '');
      expect(error.ids).toEqual(ids);
      return;
    }

    throw error;
  }

  throw new TypeError('Expected pipe chain validation to throw');
}

test('Given explicit middleware relationships, when every present edge follows declaration order, then it accepts valid explicit relationships', () => {
  // Given
  const outer = middleware({ before: ['@test/inner'], id: '@test/outer' });
  const inner = middleware({ after: ['@test/outer'], id: '@test/inner' });
  const absentTarget = middleware({ before: ['@test/absent'], id: '@test/absent-target' });
  const duplicateOne = middleware({ duplicate: 'allow', id: '@test/allowed-duplicate' });
  const duplicateTwo = middleware({ duplicate: 'allow', id: '@test/allowed-duplicate' });
  const mutableBefore: string[] = [];
  const snapshotOuter = middleware({ before: mutableBefore, id: '@test/snapshot-outer' });
  const snapshotPrevious = middleware({ id: '@test/snapshot-previous' });
  const absentConflict = middleware({
    conflicts: ['@test/absent-conflict'],
    id: '@test/absent-conflict-source',
  });
  mutableBefore.push('@test/snapshot-previous');

  // When / Then
  expect(() => validatePipeMiddlewareChain([outer, inner, absentTarget, absentConflict])).not.toThrow();
  expect(() => validatePipeMiddlewareChain([duplicateOne, duplicateTwo])).not.toThrow();
  expect(() => validatePipeMiddlewareChain([snapshotPrevious, snapshotOuter])).not.toThrow();
  expect(() => validatePipeMiddlewareAppend([outer], inner)).not.toThrow();
});

test('Given invalid chain metadata, when relationships or duplicate policy conflict, then it rejects invalid chain metadata', () => {
  // Given
  const duplicateOne = middleware({ id: '@test/rejected-duplicate' });
  const duplicateTwo = middleware({ id: '@test/rejected-duplicate' });
  const conflictOne = middleware({
    before: ['@test/missing-one'],
    duplicate: 'allow',
    id: '@test/conflicting-duplicate',
  });
  const conflictTwo = middleware({
    before: ['@test/missing-two'],
    duplicate: 'allow',
    id: '@test/conflicting-duplicate',
  });
  const outer = middleware({ after: ['@test/inner'], id: '@test/reversed-outer' });
  const inner = middleware({ id: '@test/inner' });
  const cycleOne = middleware({ before: ['@test/cycle-two'], id: '@test/cycle-one' });
  const cycleTwo = middleware({ before: ['@test/cycle-one'], id: '@test/cycle-two' });
  const conflictSource = middleware({
    conflicts: ['@test/conflict-target'],
    id: '@test/conflict-source',
  });
  const conflictTarget = middleware({ id: '@test/conflict-target' });

  // When / Then
  expectConfigurationError(
    () => validatePipeMiddlewareChain([duplicateOne, duplicateTwo]),
    'DUPLICATE_MIDDLEWARE',
    ['@test/rejected-duplicate'],
  );
  expectConfigurationError(
    () => validatePipeMiddlewareChain([conflictOne, conflictTwo]),
    'DUPLICATE_MIDDLEWARE',
    ['@test/conflicting-duplicate'],
  );
  expectConfigurationError(
    () => validatePipeMiddlewareChain([outer, inner]),
    'MIDDLEWARE_ORDER',
    ['@test/reversed-outer', '@test/inner'],
  );
  expectConfigurationError(
    () => validatePipeMiddlewareChain([cycleOne, cycleTwo]),
    'MIDDLEWARE_CYCLE',
    ['@test/cycle-one', '@test/cycle-two'],
  );
  expectConfigurationError(
    () => validatePipeMiddlewareChain([conflictSource, conflictTarget]),
    'MIDDLEWARE_CONFLICT',
    ['@test/conflict-source', '@test/conflict-target'],
  );
  expectConfigurationError(
    () => validatePipeMiddlewareChain([conflictTarget, conflictSource]),
    'MIDDLEWARE_CONFLICT',
    ['@test/conflict-source', '@test/conflict-target'],
  );
});
