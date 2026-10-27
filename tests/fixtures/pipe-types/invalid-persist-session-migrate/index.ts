import { jsonStorage } from '../../../../src/middleware';
import type {
  PersistDecoder,
  PersistMigration,
  SafePersistConfig,
} from '../../../../src/middleware';

type CounterState = {
  readonly count: number;
};

const decodeCounter: PersistDecoder<CounterState> = () => ({ count: 0 });
const toCounter: PersistMigration<unknown, CounterState> = () => ({ count: 0 });

const invalidConfig: SafePersistConfig<CounterState, readonly [typeof toCounter]> = {
  decode: decodeCounter,
  migrate: [toCounter],
  key: 'invalid-session-migration', storage: jsonStorage(() => sessionStorage)(),
};

invalidConfig;
