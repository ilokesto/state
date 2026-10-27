import { validate } from '../../../../src/middleware/validate';
import { pipe } from '../../../../src/utils/pipe';

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
      isCounterState(value) ? { value } : { issues: [{ message: 'count must be a number' }] },
    vendor: 'fixture',
    version: 1 as const,
  },
} as const;

const rejectedInitialState = pipe.use(validate(counterSchema)).create({ label: 'invalid' });

rejectedInitialState;
