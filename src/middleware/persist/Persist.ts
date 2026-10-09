import type { Store } from '@ilokesto/store';
import type { PersistStorageFactory } from './storage/PersistStorage.js';

import type { PersistDecoderStateDiagnostic as PipePersistDecoderStateDiagnostic } from '../../utils/pipe/types.js';

/**
 * One ordered data-version transition, run before decoding the final state.
 * @example
 * const migrate: PersistMigration<unknown, { count: number }> = () => ({ count: 0 });
 */
export type PersistMigration<Input = unknown, Output = unknown> = (state: Input) => Output;

/**
 * Parses untrusted persisted data; returning null rejects restoration.
 * @example
 * const decode: PersistDecoder<number> = value => typeof value === 'number' ? value : null;
 */
export type PersistDecoder<State> = (value: unknown) => State | null;

/**
 * Type-level diagnostic when the decoder output differs from the store state.
 * @example
 * type Mismatch = PersistDecoderStateDiagnostic<string, number>;
 */
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

/** Explicit policy for edits made before restoration completes.
 * @example
 * await store.persist.rehydrate({ conflict: 'keep-current' });
 */
export type PersistConflictPolicy = 'keep-current' | 'use-stored';

/** Options for a hydration attempt.
 * @example
 * const options: PersistRehydrateOptions = { conflict: 'use-stored' };
 */
export type PersistRehydrateOptions = {
  /** Omit to reject edits since creation; no implicit merge is performed. */
  readonly conflict?: PersistConflictPolicy;
};

/** Lifecycle failure with the original thrown value in `cause`.
 * @example
 * if (error instanceof PersistError && error.code === 'CONFLICT') showChoice();
 */
export class PersistError extends Error {
  /** Stable identifier for programmatic recovery. */
  readonly code: 'STORAGE' | 'INVALID_DATA' | 'VALIDATION' | 'CONFLICT' |
    'NOT_HYDRATED' | 'DISPOSED' | 'CLEARED' | 'NOTIFICATION';
  /** Operation that failed, independent of hydration and write status. */
  readonly operation: 'hydrate' | 'write' | 'clear' | 'notify' | 'dispose';

  constructor(
    operation: PersistError['operation'],
    code: PersistError['code'],
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'PersistError';
    this.operation = operation;
    this.code = code;
  }
}

/** Immutable snapshot of persistence, separate from the synchronous state.
 * @example
 * const stop = store.persist.subscribe(status => render(status.pending));
 */
export type PersistStatus = {
  /** Only `hydrated` enables automatic writes; failed attempts are retryable. */
  readonly hydration: 'idle' | 'hydrating' | 'hydrated' | 'conflict' | 'error';
  /** Current write queue state. A failed latest value remains pending. */
  readonly saving: 'idle' | 'writing' | 'error';
  /** Whether a committed or migrated value has not yet been saved. */
  readonly pending: boolean;
  /** Disposal is terminal; later controls reject with DISPOSED. */
  readonly disposed: boolean;
  /** Most recent operation failure, cleared when that operation retries. */
  readonly error: PersistError | null;
};

/** Persistence controls; creation itself never opens storage.
 * @example
 * await store.persist.rehydrate();
 * store.set(nextState);
 * await store.persist.flush();
 */
export type PersistControls = {
  /** Shares an ongoing attempt; success is a no-op thereafter; failures retry. */
  readonly rehydrate: (options?: PersistRehydrateOptions) => Promise<void>;
  /** Saves the call-time target without advancing state middleware timers. */
  readonly flush: () => Promise<void>;
  /** Deletes only this key after earlier writes; memory state is retained. */
  readonly clearStorage: () => Promise<void>;
  /** Returns the latest immutable status snapshot. */
  readonly getStatus: () => PersistStatus;
  /** Observes future statuses; callback failures are reported as NOTIFICATION errors. */
  readonly subscribe: (listener: (status: PersistStatus) => void) => () => void;
};

/** Store enhanced with explicit asynchronous persistence.
 * @example
 * const persisted: PersistStore<State> = pipe.use(persist(options)).create(initial);
 */
export type PersistStore<State> = Store<State> & {
  /** Per-store lifecycle controls and status. */
  readonly persist: PersistControls;
};

/** Storage-independent persistence configuration.
 * @example
 * persist({ key: 'editor', storage: indexedDBStorage({ database: 'editor' }), decode: decodeEditor });
 */
export type SafePersistConfig<
  State,
  Steps extends readonly MigrationFn[] = readonly [],
> = {
  /** Entry name passed unchanged to the adapter. */
  readonly key: string;
  /** Creates one owned adapter lazily; failed creation is retryable. */
  readonly storage: PersistStorageFactory;
  /** Validates or transforms migrated unknown data; null rejects restoration. */
  readonly decode: PersistDecoder<State>;
  /** Ordered version transitions; tuple length is the stored data version. */
  readonly migrate?: ValidMigrationTuple<Steps>;
};
