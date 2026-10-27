import { validate } from '../../../../src/middleware/validate';
import { definePipeableMiddleware } from '../../../../src/utils/pipe/metadata';
import { pipe } from '../../../../src/utils/pipe';
import type { PipeMiddleware } from '../../../../src/utils/pipe/types';

type CounterState = {
  readonly count: number;
};

type LabelState = {
  readonly label: string;
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
      isCounterState(value) ? { value } : { issues: [{ message: 'count must be a number' }] },
    vendor: 'fixture',
    version: 1 as const,
  },
} as const;

declare const labelMiddleware: PipeMiddleware<LabelState>;

const taggedLabelMiddleware = definePipeableMiddleware(labelMiddleware, {
  id: '@fixture/label',
} as const);

const rejectedState = pipe.use(validate(counterSchema)).use(taggedLabelMiddleware);

rejectedState;
