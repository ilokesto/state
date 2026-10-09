import { jsonStorage } from '../../../../src/middleware';
import type {
  PersistDecoder,
  PersistMigration,
  SafePersistConfig,
} from '../../../../src/middleware';

type V1 = {
  readonly value: number;
};

type V2 = {
  readonly label: string;
};

type CounterState = {
  readonly count: number;
};

const decodeCounter: PersistDecoder<CounterState> = () => ({ count: 0 });
const toV1: PersistMigration<unknown, V1> = () => ({ value: 1 });
const requiresV2: PersistMigration<V2, CounterState> = () => ({ count: 0 });

const invalidConfig: SafePersistConfig<
  CounterState,
  readonly [typeof toV1, typeof requiresV2]
> = {
  decode: decodeCounter,
  key: 'invalid-chain', storage: jsonStorage(() => localStorage),
  migrate: [toV1, requiresV2],
};

invalidConfig;
