import { jsonStorage } from '../../../../src/middleware';
import type {
  PersistDecoder,
  PersistMigration,
  SafePersistConfig,
} from '../../../../src/middleware';

type V1 = {
  readonly value: number;
};

type CounterState = {
  readonly count: number;
};

const decodeCounter: PersistDecoder<CounterState> = () => ({ count: 0 });
const requiresV1: PersistMigration<V1, CounterState> = (state) => ({ count: state.value });

const invalidConfig: SafePersistConfig<CounterState, readonly [typeof requiresV1]> = {
  decode: decodeCounter,
  key: 'invalid-first-input', storage: jsonStorage(() => localStorage),
  migrate: [requiresV1],
};

invalidConfig;
