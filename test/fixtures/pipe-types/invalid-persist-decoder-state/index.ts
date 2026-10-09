import { jsonStorage } from '../../../../src/middleware';
import { persist } from '../../../../src/middleware';
import type { PersistDecoder, SafePersistConfig } from '../../../../src/middleware';
import { pipe } from '../../../../src/utils/pipe';

type CounterState = {
  readonly count: number;
};

type ExtendedCounterState = {
  readonly count: number;
  readonly label: string;
};

const decodeCounter: PersistDecoder<CounterState> = () => ({ count: 0 });
const decodeExtendedCounter: PersistDecoder<ExtendedCounterState> = () => ({
  count: 0,
  label: 'decoded',
});
const safeConfig: SafePersistConfig<ExtendedCounterState> = {
  decode: decodeExtendedCounter,
  key: 'safe-config-variable', storage: jsonStorage(() => localStorage),
};

const rejectedCurriedInline = pipe
  .use(persist({ decode: decodeCounter, key: 'curried-inline', storage: jsonStorage(() => localStorage)}))
  .create<ExtendedCounterState>({ count: 0, label: 'extra' });
const rejectedCurriedVariable = pipe
  .use(persist(safeConfig))
  .create<CounterState>({ count: 0 });

rejectedCurriedInline;
rejectedCurriedVariable;
