import { jsonStorage } from '../../../../src/middleware';
import { debounce, persist } from '../../../../src/middleware';
import { pipe } from '../../../../src/utils/pipe';

type CounterState = {
  readonly count: number;
};

const decodeCounter = (value: unknown): CounterState | null => {
  if (typeof value !== 'object' || value === null || !('count' in value)) {
    return null;
  }

  return typeof value.count === 'number' ? { count: value.count } : null;
};

const unsafeOrder = pipe
  .use(persist({ decode: decodeCounter, key: 'persist-before-debounce', storage: jsonStorage(() => localStorage)}))
  .use(debounce(25));

unsafeOrder;
