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
  /** Patch that advances the previous selection to the next selection. */
  readonly forward: Patch;
  /** Patch that restores the previous selection from the next selection. */
  readonly inverse: Patch;
};

/** Pure hooks for recording and applying changes to the selected state. */
export type HistoryStrategy<Selection, Patch> = {
  /** Compute forward and inverse patches for a committed selected transition. */
  readonly diff: (previous: Selection, next: Selection) => HistoryDiff<Patch>;
  /** Apply a recorded patch to the current selection without mutating it. */
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
      /** Extract the portion of state tracked by history; requires restore. */
      readonly select: (state: Readonly<State>) => Selection;
      /** Restore the selection while preserving untracked fields from current. */
      readonly restore: (current: Readonly<State>, selection: Selection) => State;
    }
    | ([Readonly<State>] extends [Selection]
        ? [Selection] extends [Readonly<State>]
          ? {
            /** Omit when tracking the entire state without selection hooks. */
            readonly select?: never;
            /** Omit when replay replaces the entire state with a snapshot. */
            readonly restore?: never;
          }
          : never
        : never)
  );

/** Immutable, referentially stable between history changes. */
export type HistoryStatus = {
  /** Whether an undo entry is available. */
  readonly canUndo: boolean;
  /** Whether a redo entry is available. */
  readonly canRedo: boolean;
  /** Number of available undo entries, counting each group as one entry. */
  readonly undoDepth: number;
  /** Number of available redo entries. */
  readonly redoDepth: number;
  /** Whether recording is currently paused. */
  readonly isPaused: boolean;
  /** Whether a synchronous history group is currently open. */
  readonly isGrouping: boolean;
  /** Whether the history runtime has been disposed. */
  readonly disposed: boolean;
};

export type HistoryControls = {
  /** Replay the most recent undo entry through the middleware pipeline. */
  readonly undo: () => void;
  /** Replay the most recently undone entry through the middleware pipeline. */
  readonly redo: () => void;
  /** Report whether an undo entry is available. */
  readonly canUndo: () => boolean;
  /** Report whether a redo entry is available. */
  readonly canRedo: () => boolean;
  /** Clear entries and notify metadata subscribers without changing body state. */
  readonly clearHistory: () => void;
  /** Nest synchronous callbacks into one entry; committed work survives exceptions. */
  readonly group: <Result>(
    action: () => Result & (Extract<Result, PromiseLike<unknown>> extends never ? unknown : never),
  ) => Result;
  /** Pause recording subsequent committed transitions. */
  readonly pauseHistory: () => void;
  /** Resume recording subsequent committed transitions. */
  readonly resumeHistory: () => void;
  /** Read the immutable status snapshot, stable between history changes. */
  readonly getHistoryStatus: () => HistoryStatus;
  /** Subscribe to metadata changes, not immediately to the current snapshot. */
  readonly subscribeHistory: (listener: (status: HistoryStatus) => void) => () => void;
};

export type HistoryStore<State> = Store<State> & HistoryControls;

/**
 * @description Reports that installing history would overwrite an existing
 * store property. Extends TypeError and identifies the conflicting control.
 * @example
 * ```ts
 * const error = new HistoryConfigurationError('CONTROL_COLLISION', 'undo');
 * console.log(error.property); // 'undo'
 * ```
 */
export class HistoryConfigurationError extends TypeError {
  /** Stable error name for logging and diagnostics. */
  readonly name = 'HistoryConfigurationError';

  /**
   * @description Creates an error identifying the existing store property that
   * prevents a history control from being installed.
   * @param {'CONTROL_COLLISION'} code - Discriminator for a history control collision.
   * @param {keyof HistoryControls} property - Name of the conflicting store property.
   * @example
   * ```ts
   * throw new HistoryConfigurationError('CONTROL_COLLISION', 'redo');
   * ```
   */
  constructor(
    /** Discriminator identifying a history control collision. */
    readonly code: 'CONTROL_COLLISION',
    /** Store property that conflicts with a history control. */
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
  /** Maximum undo entries; defaults to 300. */
  readonly limit?: number;
  /** Unavailable in the state-independent overload; use typed options instead. */
  readonly filter?: never;
  /** Unavailable in the state-independent overload; use typed options instead. */
  readonly isEqual?: never;
  /** Unavailable in the state-independent overload; use typed options instead. */
  readonly strategy?: never;
  /** Unavailable in the state-independent overload; use typed options instead. */
  readonly select?: never;
  /** Unavailable in the state-independent overload; use typed options instead. */
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
 * @description Records committed transitions with synchronous groups, selective
 * restoration, metadata subscriptions, and optional typed reversible patches.
 * Adds non-writable history controls to the store; existing properties with
 * those names cause HistoryConfigurationError during middleware application.
 *
 * Replay traverses middleware. Rejected writes retain their entries; reentrant
 * user commits are recorded separately. Replay cancels queued timer work and
 * traverses validation synchronously without being delayed by timer middleware.
 *
 * The limit defaults to 300 and must be a finite non-negative integer, otherwise
 * creation throws RangeError. Selection and restoration hooks must be supplied
 * together, otherwise creation throws TypeError. Without those hooks, history
 * tracks and restores the entire state.
 *
 * @param {HistoryLimitOptions | HistoryOptions<State, Selection, Patch>} [options] - Recording configuration; omission tracks full-state snapshots.
 * @param {number} [options.limit] - Maximum undo entries, counting each group as one entry; zero retains no undo entries.
 * @param {(previous: Readonly<State>, next: Readonly<State>) => boolean} [options.filter] - Return false to skip recording a committed transition.
 * @param {(previous: Selection, next: Selection) => boolean} [options.isEqual] - Selected-value equality test; defaults to Object.is.
 * @param {HistoryStrategy<Selection, Patch>} [options.strategy] - Pure patch hooks; omit to retain selected snapshots.
 * @param {(state: Readonly<State>) => Selection} [options.select] - Extract tracked state; must be paired with restore.
 * @param {(current: Readonly<State>, selection: Selection) => State} [options.restore] - Restore tracked state while preserving untracked current fields; must be paired with select.
 * @param {(previous: Selection, next: Selection) => HistoryDiff<Patch>} [options.strategy.diff] - Compute forward and inverse patches for the selected transition.
 * @param {(current: Selection, patch: Patch) => Selection} [options.strategy.apply] - Apply a recorded patch to the current selection.
 * @returns {HistoryPipeMiddleware | TypedHistoryPipeMiddleware<State>} Pipeable middleware that installs history controls; typed options constrain the accepted state.
 * - pipeMiddlewareMetadataBrand `HistoryMetadata` - Compile-time middleware composition metadata.
 * : pipeMiddlewareMetadataBrand.adds `readonly [HistoryCapability]` - History capability supplied by this middleware.
 * : pipeMiddlewareMetadataBrand.adds.0 `HistoryCapability` - Descriptor of the supplied history controls.
 * : pipeMiddlewareMetadataBrand.adds.0.id `'@ilokesto/state/history-controls'` - History capability identifier.
 * : pipeMiddlewareMetadataBrand.adds.0.shape `HistoryControls` - Control surface added to the store.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.undo `() => void` - Replay the most recent undo entry.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.redo `() => void` - Replay the most recently undone entry.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.canUndo `() => boolean` - Report whether an undo entry is available.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.canRedo `() => boolean` - Report whether a redo entry is available.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.clearHistory `() => void` - Clear entries and notify metadata subscribers without changing body state.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.group `HistoryControls['group']` - Combine nested synchronous work into one entry and return its result; committed work survives exceptions.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.pauseHistory `() => void` - Pause recording committed transitions.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.resumeHistory `() => void` - Resume recording committed transitions.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.getHistoryStatus `() => HistoryStatus` - Read the stable immutable history status.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.subscribeHistory `(listener: (status: HistoryStatus) => void) => () => void` - Subscribe to subsequent metadata changes and return an unsubscribe function; does not immediately emit the current status.
 * : pipeMiddlewareMetadataBrand.adds.0.pipeCapabilityBrand `HistoryCapability` - Nominal capability typing marker.
 * : pipeMiddlewareMetadataBrand.after `HistoryMetadata['after']` - Declared middleware ordering constraints for predecessors.
 * : pipeMiddlewareMetadataBrand.before `HistoryMetadata['before']` - Declared middleware ordering constraints for successors.
 * : pipeMiddlewareMetadataBrand.conflicts `HistoryMetadata['conflicts']` - Declared incompatible middleware identifiers.
 * : pipeMiddlewareMetadataBrand.duplicate `'reject'` - Reject repeated installation of history middleware.
 * : pipeMiddlewareMetadataBrand.id `'@ilokesto/state/history'` - Middleware identifier used for composition.
 * : pipeMiddlewareMetadataBrand.requires `readonly []` - No prerequisite capabilities.
 * - pipeStateMismatchKindBrand `TypedHistoryPipeMiddleware<State>` - Compile-time marker used for state compatibility diagnostics.
 * @example
 * ```ts
 * const fullStateHistory = history({ limit: 100 });
 *
 * const countHistory = history<{ count: number; query: string }, number>({
 *   limit: 50,
 *   select: state => state.count,
 *   restore: (current, count) => ({ ...current, count }),
 *   isEqual: Object.is,
 * });
 * // Use countHistory in the middleware pipeline to track count while
 * // preserving the current query during undo and redo.
 * ```
 */
export function history(options?: HistoryLimitOptions): HistoryPipeMiddleware;
/**
 * @description Records committed transitions with synchronous groups, selective
 * restoration, metadata subscriptions, and optional typed reversible patches.
 * Adds non-writable history controls to the store; existing properties with
 * those names cause HistoryConfigurationError during middleware application.
 *
 * Replay traverses middleware. Rejected writes retain their entries; reentrant
 * user commits are recorded separately. Replay cancels queued timer work and
 * traverses validation synchronously without being delayed by timer middleware.
 *
 * The limit defaults to 300 and must be a finite non-negative integer, otherwise
 * creation throws RangeError. Selection and restoration hooks must be supplied
 * together, otherwise creation throws TypeError. Without those hooks, history
 * tracks and restores the entire state.
 *
 * @param {HistoryLimitOptions | HistoryOptions<State, Selection, Patch>} [options] - Recording configuration; omission tracks full-state snapshots.
 * @param {number} [options.limit] - Maximum undo entries, counting each group as one entry; zero retains no undo entries.
 * @param {(previous: Readonly<State>, next: Readonly<State>) => boolean} [options.filter] - Return false to skip recording a committed transition.
 * @param {(previous: Selection, next: Selection) => boolean} [options.isEqual] - Selected-value equality test; defaults to Object.is.
 * @param {HistoryStrategy<Selection, Patch>} [options.strategy] - Pure patch hooks; omit to retain selected snapshots.
 * @param {(state: Readonly<State>) => Selection} [options.select] - Extract tracked state; must be paired with restore.
 * @param {(current: Readonly<State>, selection: Selection) => State} [options.restore] - Restore tracked state while preserving untracked current fields; must be paired with select.
 * @param {(previous: Selection, next: Selection) => HistoryDiff<Patch>} [options.strategy.diff] - Compute forward and inverse patches for the selected transition.
 * @param {(current: Selection, patch: Patch) => Selection} [options.strategy.apply] - Apply a recorded patch to the current selection.
 * @returns {HistoryPipeMiddleware | TypedHistoryPipeMiddleware<State>} Pipeable middleware that installs history controls; typed options constrain the accepted state.
 * - pipeMiddlewareMetadataBrand `HistoryMetadata` - Compile-time middleware composition metadata.
 * : pipeMiddlewareMetadataBrand.adds `readonly [HistoryCapability]` - History capability supplied by this middleware.
 * : pipeMiddlewareMetadataBrand.adds.0 `HistoryCapability` - Descriptor of the supplied history controls.
 * : pipeMiddlewareMetadataBrand.adds.0.id `'@ilokesto/state/history-controls'` - History capability identifier.
 * : pipeMiddlewareMetadataBrand.adds.0.shape `HistoryControls` - Control surface added to the store.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.undo `() => void` - Replay the most recent undo entry.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.redo `() => void` - Replay the most recently undone entry.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.canUndo `() => boolean` - Report whether an undo entry is available.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.canRedo `() => boolean` - Report whether a redo entry is available.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.clearHistory `() => void` - Clear entries and notify metadata subscribers without changing body state.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.group `HistoryControls['group']` - Combine nested synchronous work into one entry and return its result; committed work survives exceptions.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.pauseHistory `() => void` - Pause recording committed transitions.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.resumeHistory `() => void` - Resume recording committed transitions.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.getHistoryStatus `() => HistoryStatus` - Read the stable immutable history status.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.subscribeHistory `(listener: (status: HistoryStatus) => void) => () => void` - Subscribe to subsequent metadata changes and return an unsubscribe function; does not immediately emit the current status.
 * : pipeMiddlewareMetadataBrand.adds.0.pipeCapabilityBrand `HistoryCapability` - Nominal capability typing marker.
 * : pipeMiddlewareMetadataBrand.after `HistoryMetadata['after']` - Declared middleware ordering constraints for predecessors.
 * : pipeMiddlewareMetadataBrand.before `HistoryMetadata['before']` - Declared middleware ordering constraints for successors.
 * : pipeMiddlewareMetadataBrand.conflicts `HistoryMetadata['conflicts']` - Declared incompatible middleware identifiers.
 * : pipeMiddlewareMetadataBrand.duplicate `'reject'` - Reject repeated installation of history middleware.
 * : pipeMiddlewareMetadataBrand.id `'@ilokesto/state/history'` - Middleware identifier used for composition.
 * : pipeMiddlewareMetadataBrand.requires `readonly []` - No prerequisite capabilities.
 * - pipeStateMismatchKindBrand `TypedHistoryPipeMiddleware<State>` - Compile-time marker used for state compatibility diagnostics.
 * @example
 * ```ts
 * const fullStateHistory = history({ limit: 100 });
 *
 * const countHistory = history<{ count: number; query: string }, number>({
 *   limit: 50,
 *   select: state => state.count,
 *   restore: (current, count) => ({ ...current, count }),
 *   isEqual: Object.is,
 * });
 * // Use countHistory in the middleware pipeline to track count while
 * // preserving the current query during undo and redo.
 * ```
 */
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
