import { history } from '../../../../src/middleware';
import { Store } from '@ilokesto/store';
import type {
  HistoryControls, HistoryDiff, HistoryOptions, HistoryStatus, HistoryStore, HistoryStrategy,
} from '../../../../src/middleware';
import { pipe } from '../../../../src/utils/pipe';

type Editor = { text: string; cursor: number };
type Patch = { value: string };
const strategy: HistoryStrategy<string, Patch> = {
  diff: (previous, next): HistoryDiff<Patch> => ({
    forward: { value: next }, inverse: { value: previous },
  }),
  apply: (_current, patch) => patch.value,
};
const options: HistoryOptions<Editor, string, Patch> = {
  select: (state) => state.text,
  restore: (current, text) => ({ ...current, text }),
  filter: (previous, next) => previous.text !== next.text,
  strategy,
};
const store: HistoryStore<Editor> = pipe.use(history(options)).create({ text: '', cursor: 0 });
const controls: HistoryControls = store;
const status: HistoryStatus = controls.getHistoryStatus();
const result: number = store.group(() => 42);
const inferred = pipe.use(history({
  select: (state: Readonly<Editor>) => state.text,
  restore: (current, text) => ({ ...current, text }),
  strategy,
})).create({ text: '', cursor: 0 });
const text: string = inferred.getState().text;
const numberStore: HistoryStore<number> = history({ limit: 2 })(new Store<number>(0));
const numberStrategy = history<number, number, number>({
  strategy: {
    diff: (previous, next) => ({ forward: next - previous, inverse: previous - next }),
    apply: (current, delta) => current + delta,
  },
})(new Store<number>(0));
const count: number = numberStrategy.getState();
void [status, result, text, numberStore, count];

const groupFn = store.group;
type AcceptsMaybeAsync = (() => number | Promise<number>) extends
  Parameters<typeof groupFn<number | Promise<number>>>[0] ? true : false;
const acceptsMaybeAsync: AcceptsMaybeAsync = false;
void acceptsMaybeAsync;
