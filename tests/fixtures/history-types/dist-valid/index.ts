import { history } from '@ilokesto/state/middleware';
import type { HistoryDiff, HistoryStatus, HistoryStore, HistoryStrategy } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const strategy: HistoryStrategy<number, { delta: number }> = {
  diff: (previous, next): HistoryDiff<{ delta: number }> => ({
    forward: { delta: next - previous }, inverse: { delta: previous - next },
  }),
  apply: (current, patch) => current + patch.delta,
};
const store: HistoryStore<{ count: number; label: string }> = pipe.use(history({
  select: (state: Readonly<{ count: number; label: string }>) => state.count,
  restore: (current, count) => ({ ...current, count }),
  strategy,
})).create({ count: 0, label: 'kept' });
const status: HistoryStatus = store.getHistoryStatus();
const result: string = store.group(() => 'done');
store.subscribeHistory(snapshot => { const paused: boolean = snapshot.isPaused; void paused; });
void [status, result];

const groupFn = store.group;
type AcceptsMaybeAsync = (() => number | Promise<number>) extends
  Parameters<typeof groupFn<number | Promise<number>>>[0] ? true : false;
const acceptsMaybeAsync: AcceptsMaybeAsync = false;
void acceptsMaybeAsync;
