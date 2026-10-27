import type {
  PipeMiddlewareAppendValidation,
  PipeMiddlewareMetadata,
} from '../../../../src/utils/pipe/types';

const conflictSource = {
  conflicts: ['@fixture/conflict-target'],
  id: '@fixture/conflict-source',
} as const satisfies PipeMiddlewareMetadata;
const conflictTarget = {
  id: '@fixture/conflict-target',
} as const satisfies PipeMiddlewareMetadata;

const invalidConflict: PipeMiddlewareAppendValidation<
  readonly [typeof conflictSource],
  typeof conflictTarget
> = {
  conflict: '@fixture/conflict-target',
  middleware: '@fixture/conflict-source',
};

invalidConflict;
