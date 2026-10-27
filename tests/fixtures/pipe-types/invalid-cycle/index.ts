import type {
  PipeMiddlewareAppendValidation,
  PipeMiddlewareMetadata,
} from '../../../../src/utils/pipe/types';

const outer = {
  before: ['@fixture/inner'],
  id: '@fixture/outer',
} as const satisfies PipeMiddlewareMetadata;

const inner = {
  before: ['@fixture/outer'],
  id: '@fixture/inner',
} as const satisfies PipeMiddlewareMetadata;

const rejectedCycle: PipeMiddlewareAppendValidation<
  readonly [typeof outer],
  typeof inner
> = { current: [outer], next: inner };

rejectedCycle;
