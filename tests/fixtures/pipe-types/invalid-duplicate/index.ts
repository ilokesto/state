import type {
  PipeMiddlewareAppendValidation,
  PipeMiddlewareMetadata,
} from '../../../../src/utils/pipe/types';

const first = {
  duplicate: 'reject',
  id: '@fixture/duplicate',
} as const satisfies PipeMiddlewareMetadata;

const second = {
  id: '@fixture/duplicate',
} as const satisfies PipeMiddlewareMetadata;

const rejectedDuplicate: PipeMiddlewareAppendValidation<
  readonly [typeof first],
  typeof second
> = { current: [first], next: second };

const allowedFirst = {
  before: ['@fixture/missing-one'],
  duplicate: 'allow',
  id: '@fixture/conflicting-duplicate',
} as const satisfies PipeMiddlewareMetadata;

const allowedSecond = {
  before: ['@fixture/missing-two'],
  duplicate: 'allow',
  id: '@fixture/conflicting-duplicate',
} as const satisfies PipeMiddlewareMetadata;

const rejectedConflict: PipeMiddlewareAppendValidation<
  readonly [typeof allowedFirst],
  typeof allowedSecond
> = { current: [allowedFirst], next: allowedSecond };

rejectedDuplicate;
rejectedConflict;
