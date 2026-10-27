import { history } from '../../../../src/middleware';
import type { HistoryOptions } from '../../../../src/middleware';
import { pipe } from '../../../../src/utils/pipe';

history<{ count: number }, number>({ select: (state: Readonly<{ count: number }>) => state.count });
history<number, number, { delta: number }>({
  strategy: {
    diff: (previous, next) => ({ forward: { delta: next - previous }, inverse: { delta: previous - next } }),
    apply: (current, patch: string) => current + patch.length,
  },
});
const store = pipe.use(history()).create({ count: 0 });
store.group(async () => 1);
pipe.use(history({
  select: (state: Readonly<{ count: number }>) => state.count,
  restore: (_current, count) => ({ count }),
})).create({ count: 'wrong' });
history<{ count: number }, number>({
  select: (state) => state.count,
  restore: (_current, count) => ({ count: String(count) }),
});
history<number, number | string>({ strategy: {
  diff: (previous, next) => ({ forward: next, inverse: previous }),
  apply: (_current, patch) => patch,
} });
const selectedOptions: HistoryOptions<{ count: number }, number> = {
  select: (state) => state.count,
  restore: (_current, count) => ({ count }),
};
pipe.use(history(selectedOptions)).create({ count: 'wrong' });
