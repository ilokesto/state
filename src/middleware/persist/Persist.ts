import type { Store } from '@ilokesto/store';

import type { PersistDecoderStateDiagnostic as PipePersistDecoderStateDiagnostic } from '../../utils/pipe/types.js';

export type PersistMigration<Input = unknown, Output = unknown> = (state: Input) => Output;

export type PersistDecoder<State> = (value: unknown) => State | null;

export type PersistDecoderStateDiagnostic<DecodedState, StoreState> =
  PipePersistDecoderStateDiagnostic<DecodedState, StoreState>;

export type PersistDecoderStateValidation<DecodedState, StoreState> = [StoreState] extends [
  DecodedState,
]
  ? [DecodedState] extends [StoreState]
    ? unknown
    : PersistDecoderStateDiagnostic<DecodedState, StoreState>
  : PersistDecoderStateDiagnostic<DecodedState, StoreState>;

export type MigrationFn = {
  bivarianceHack(state: unknown): unknown;
}['bivarianceHack'];

export type OnRehydrateStorageCallback<State> = (
  state: State | undefined,
  error: unknown,
) => void;

export type OnRehydrateStorage<State> = (
  state: State | undefined,
) => OnRehydrateStorageCallback<State>;

type MigrationTupleValidation<
  Steps extends readonly MigrationFn[],
  PreviousOutput = unknown,
> = Steps extends readonly [
  infer First extends MigrationFn,
  ...infer Rest extends readonly MigrationFn[],
]
  ? First extends PersistMigration<infer NextInput, infer NextOutput>
    ? [PreviousOutput] extends [NextInput]
      ? MigrationTupleValidation<Rest, NextOutput>
      : {
          readonly __persistMigrationChainError: '__persistMigrationChainError';
          readonly previous: PreviousOutput;
          readonly next: NextInput;
        }
    : never
  : unknown;

type ValidMigrationTuple<Steps extends readonly MigrationFn[]> = Steps &
  MigrationTupleValidation<Steps>;

export type PersistControls<State> = {
  readonly hasHydrated: () => boolean;
  readonly rehydrate: () => void;
};

export type PersistStore<State> = Store<State> & {
  readonly persist: PersistControls<State>;
};

export type SafePersistLocalConfig<
  State,
  Steps extends readonly MigrationFn[],
> = {
  readonly local: string;
  readonly decode: PersistDecoder<State>;
  readonly migrate?: ValidMigrationTuple<Steps>;
  readonly skipHydration?: boolean;
  readonly onRehydrateStorage?: OnRehydrateStorage<State>;
};

export type SafePersistCookieConfig<
  State,
  Steps extends readonly MigrationFn[],
> = {
  readonly cookie: string;
  readonly decode: PersistDecoder<State>;
  readonly migrate?: ValidMigrationTuple<Steps>;
  readonly skipHydration?: boolean;
  readonly onRehydrateStorage?: OnRehydrateStorage<State>;
};

export type SafePersistSessionConfig<State> = {
  readonly session: string;
  readonly decode: PersistDecoder<State>;
  readonly migrate?: never;
  readonly skipHydration?: boolean;
  readonly onRehydrateStorage?: OnRehydrateStorage<State>;
};

export type SafePersistConfig<
  State,
  Steps extends readonly MigrationFn[] = readonly [],
> =
  | SafePersistLocalConfig<State, Steps>
  | SafePersistCookieConfig<State, Steps>
  | SafePersistSessionConfig<State>;

export type PersistUtils = {
  common: {
    storageKey: string;
    storageType: 'local' | 'session' | 'cookie' | null;
  };
  setStorage: <T>(
    props: PersistUtils['common'] & {
      storageVersion: number;
      value: T;
    },
  ) => void;
};