import type {
  PipeMiddlewareAppendValidation,
  PipeMiddlewareMetadata,
} from '../../../../src/utils/pipe/types';

const outer = {
  after: ['@fixture/inner'],
  id: '@fixture/outer',
} as const satisfies PipeMiddlewareMetadata;

const inner = {
  id: '@fixture/inner',
} as const satisfies PipeMiddlewareMetadata;

const rejectedOrder: PipeMiddlewareAppendValidation<
  readonly [typeof outer],
  typeof inner
> = { current: [outer], next: inner };

rejectedOrder;
