import type { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStore.js';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type {
  PipeAnyMiddleware,
  PipeCapability,
  PipeMiddleware,
  PipeMiddlewareMetadata,
} from '../utils/pipe/types.js';
import { createHistoryRuntime, initialHistoryStatus } from './history/createHistoryRuntime.js';

/** A reversible, application-defined change. No JSON representation is assumed. */
export type HistoryDiff<Patch> = {
  readonly forward: Patch;
  readonly inverse: Patch;
};

/** Pure hooks for recording and applying changes to the selected state. */
export type HistoryStrategy<Selection, Patch> = {
  readonly diff: (previous: Selection, next: Selection) => HistoryDiff<Patch>;
  readonly apply: (current: Selection, patch: Patch) => Selection;
};

type HistorySettings<State, Selection, Patch> = {
  /** Maximum undo entries, counting a group as one entry. Defaults to 300. */
  readonly limit?: number;
  /** Return false to skip recording a committed transition. */
  readonly filter?: (previous: Readonly<State>, next: Readonly<State>) => boolean;
  /** Equality of selected values. Defaults to Object.is. */
  readonly isEqual?: (previous: Selection, next: Selection) => boolean;
  /** Omit to retain full selected snapshots. */
  readonly strategy?: HistoryStrategy<Selection, Patch>;
};

export type HistoryOptions<State = unknown, Selection = Readonly<State>, Patch = Selection> =
  HistorySettings<State, Selection, Patch> & (
    | {
      readonly select: (state: Readonly<State>) => Selection;
      /** Restore the selection while preserving untracked fields from current. */
      readonly restore: (current: Readonly<State>, selection: Selection) => State;
    }
    | ([Readonly<State>] extends [Selection]
        ? [Selection] extends [Readonly<State>]
          ? { readonly select?: never; readonly restore?: never }
          : never
        : never)
  );

/** Immutable, referentially stable between history changes. */
export type HistoryStatus = {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly isPaused: boolean;
  readonly isGrouping: boolean;
  readonly disposed: boolean;
};

export type HistoryControls = {
  readonly undo: () => void;
  readonly redo: () => void;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  /** Clear entries and notify metadata subscribers without changing body state. */
  readonly clearHistory: () => void;
  /** Nest synchronous callbacks into one entry; committed work survives exceptions. */
  readonly group: <Result>(
    action: () => Result & (Extract<Result, PromiseLike<unknown>> extends never ? unknown : never),
  ) => Result;
  readonly pauseHistory: () => void;
  readonly resumeHistory: () => void;
  readonly getHistoryStatus: () => HistoryStatus;
  /** Subscribe to metadata changes, not immediately to the current snapshot. */
  readonly subscribeHistory: (listener: (status: HistoryStatus) => void) => () => void;
};

export type HistoryStore<State> = Store<State> & HistoryControls;

export class HistoryConfigurationError extends TypeError {
  readonly name = 'HistoryConfigurationError';

  constructor(
    readonly code: 'CONTROL_COLLISION',
    readonly property: keyof HistoryControls,
  ) {
    super(`History control ${property} conflicts with an existing Store property`);
  }
}

type HistoryCapability = PipeCapability<'@ilokesto/state/history-controls', HistoryControls>;
type HistoryMetadata = PipeMiddlewareMetadata<
  '@ilokesto/state/history',
  readonly [],
  readonly [HistoryCapability],
  'reject',
  readonly []
>;
type HistoryPipeMiddleware = PipeableMiddleware<
  PipeAnyMiddleware<readonly [], readonly [HistoryCapability]>,
  HistoryMetadata
>;
type TypedHistoryPipeMiddleware<State> = PipeableMiddleware<
  PipeMiddleware<State, readonly [], readonly [HistoryCapability]>,
  HistoryMetadata
>;
type HistoryLimitOptions = {
  readonly limit?: number;
  readonly filter?: never;
  readonly isEqual?: never;
  readonly strategy?: never;
  readonly select?: never;
  readonly restore?: never;
};

const historyControlKeys = [
  'undo',
  'redo',
  'canUndo',
  'canRedo',
  'clearHistory',
  'group',
  'pauseHistory',
  'resumeHistory',
  'getHistoryStatus',
  'subscribeHistory',
] as const satisfies readonly (keyof HistoryControls)[];
const historyCapability: HistoryCapability = {
  id: '@ilokesto/state/history-controls',
  shape: {
    undo: () => undefined,
    redo: () => undefined,
    canUndo: () => false,
    canRedo: () => false,
    clearHistory: () => undefined,
    group: (action) => action(),
    pauseHistory: () => undefined,
    resumeHistory: () => undefined,
    getHistoryStatus: () => initialHistoryStatus,
    subscribeHistory: () => () => undefined,
  },
};

/**
 * Record committed transitions with synchronous groups, selective restoration,
 * metadata subscriptions, and optional typed reversible patches.
 *
 * Replay traverses middleware. Rejected writes retain their entries; reentrant
 * user commits are recorded separately. Replay cancels queued timer work and
 * traverses validation synchronously without being delayed by timer middleware.
 */
export function history(options?: HistoryLimitOptions): HistoryPipeMiddleware;
export function history<State, Selection = Readonly<State>, Patch = Selection>(
  options: HistoryOptions<State, Selection, Patch>,
): TypedHistoryPipeMiddleware<State>;
export function history<State, Selection = Readonly<State>, Patch = Selection>(
  options?: HistoryOptions<State, Selection, Patch>,
): TypedHistoryPipeMiddleware<State> {
  const limit = options?.limit ?? 300;
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 0) {
    throw new RangeError('History limit must be a finite non-negative integer');
  }
  if ((options?.select === undefined) !== (options?.restore === undefined)) {
    throw new TypeError('History select and restore must be provided together');
  }

  const middleware: PipeMiddleware<State, readonly [], readonly [HistoryCapability]> = (initialState) => {
    const store = getStore(initialState);
    for (const key of historyControlKeys) {
      if (key in store) {
        throw new HistoryConfigurationError('CONTROL_COLLISION', key);
      }
    }
    // The public conditional type permits omitted selection hooks only when
    // Selection and Readonly<State> are mutually assignable.
    const fullOptions = options as HistorySettings<State, Readonly<State>, Patch> | undefined;
    const controls = options?.select === undefined
      ? createHistoryRuntime(store, {
          limit,
          select: (state) => state,
          restore: (_current, selected) => selected,
          filter: fullOptions?.filter,
          isEqual: fullOptions?.isEqual ?? Object.is,
          strategy: fullOptions?.strategy,
        })
      : createHistoryRuntime(store, {
          limit,
          select: options.select,
          restore: options.restore,
          filter: options.filter,
          isEqual: options.isEqual ?? Object.is,
          strategy: options.strategy,
        });
    for (const key of historyControlKeys) {
      Object.defineProperty(store, key, {
        configurable: false, enumerable: true, value: controls[key], writable: false,
      });
    }
    return store as HistoryStore<State>;
  };

  return definePipeableMiddleware(middleware, {
    adds: [historyCapability],
    after: [],
    before: [],
    conflicts: [],
    duplicate: 'reject',
    id: '@ilokesto/state/history',
    requires: [],
  } as const);
}
