import { Store } from '@ilokesto/store';
import type { StoreCommit } from '@ilokesto/store';
import { runWithStoreActionMetadata } from '../../lib/actionMetadata.js';
import { devtoolsRestoreSource, registerRestoreBaseline, restoreSource } from '../../lib/restoreSource.js';
import { registerStoreCleanup } from '../../lib/storeCleanup.js';
import { cancelStoreTimers, runWithTimerReplay } from '../../lib/timerReplay.js';
import type { HistoryControls, HistoryStatus, HistoryStrategy } from '../history.js';

type HistoryStep<Selection> = {
  /** Reverses this step against the current selection. */
  readonly undo: (current: Selection) => Selection;
  /** Reapplies this step against the current selection. */
  readonly redo: (current: Selection) => Selection;
};
type HistoryEntry<Selection> = {
  /** Steps in commit order; undo applies them in reverse order. */
  readonly steps: HistoryStep<Selection>[];
  /** Identity shared by entries recorded within the same synchronous group. */
  readonly group: object | undefined;
};
type Replay<State, Selection> = {
  /** Store action that restores the replayed selection into the actual state. */
  readonly action: (current: State) => State;
  /** History entry this replay attempts to consume. */
  readonly entry: HistoryEntry<Selection>;
  /** Stack from which the entry is consumed. */
  readonly source: HistoryEntry<Selection>[];
  /** Stack receiving the corresponding replay entry. */
  readonly target: HistoryEntry<Selection>[];
  /** Direction in which the entry's steps are applied. */
  readonly direction: 'undo' | 'redo';
  /** First commit sequence eligible to belong to this replay, once its action runs. */
  firstSequence: number | undefined;
  /** Whether middleware has associated a commit sequence with this replay. */
  scheduled: boolean;
  /** Whether a commit has already handled this replay request. */
  consumed: boolean;
};
type DispatchContext<State, Selection> = {
  /** Replay associated with this dispatch, if it is a history action. */
  readonly replay: Replay<State, Selection> | undefined;
  /** Group identity captured while this dispatch is on the stack. */
  readonly group: object | undefined;
  /** Recording pause state captured at dispatch time. */
  readonly paused: boolean;
};
type RuntimeOptions<State, Selection, Patch> = {
  /** Maximum entries retained per stack; zero disables entry retention. */
  readonly limit: number;
  /** Extracts the portion of committed state tracked by history. */
  readonly select: (state: Readonly<State>) => Selection;
  /** Merges a replayed selection into the current full state. */
  readonly restore: (current: Readonly<State>, selection: Selection) => State;
  /** Accepts changed commits for recording; undefined accepts all changed commits. */
  readonly filter: ((previous: Readonly<State>, next: Readonly<State>) => boolean) | undefined;
  /** Compares selections to determine whether a commit changes tracked state. */
  readonly isEqual: (previous: Selection, next: Selection) => boolean;
  /** Patch operations, or undefined to retain previous and next selections directly. */
  readonly strategy: HistoryStrategy<Selection, Patch> | undefined;
};

export const initialHistoryStatus: HistoryStatus = Object.freeze({
  canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0,
  isPaused: false, isGrouping: false, disposed: false,
});

/**
 * @description Installs commit-based undo and redo tracking on a store and returns
 * controls for replay, synchronous grouping, recording pauses, and status observation.
 * Tracks selected state using snapshots or reversible patches. Changed ordinary
 * commits invalidate redo even when paused or filtered out. Restore-source commits
 * clear the timeline. Replay cancels pending store timers and is forbidden inside
 * a group; reentrant replay requests wait for outstanding commits.
 * Recording-hook failures clear history before propagating the error.
 * Store cleanup disposes tracking, clears history, and publishes terminal status.
 * @param {Store<State>} store - Store whose committed state changes are tracked.
 * @param {RuntimeOptions<State, Selection, Patch>} options - Selection, recording,
 * and replay configuration; hooks should be pure.
 * @param {number} options.limit - Maximum entries per undo or redo stack; use a
 * nonnegative integer, with zero retaining no entries.
 * @param {(state: Readonly<State>) => Selection} options.select - Extracts the
 * tracked selection from each committed state and the current replay state.
 * @param {(current: Readonly<State>, selection: Selection) => State} options.restore -
 * Produces the full replay state by merging the restored selection into current state.
 * @param {((previous: Readonly<State>, next: Readonly<State>) => boolean) | undefined} options.filter -
 * Determines whether a changed ordinary commit is recorded; undefined accepts all.
 * @param {(previous: Selection, next: Selection) => boolean} options.isEqual -
 * Returns true when two selections are equivalent and need no history step.
 * @param {HistoryStrategy<Selection, Patch> | undefined} options.strategy -
 * Reversible patch strategy, or undefined to store selection snapshots.
 * @param {(previous: Selection, next: Selection) => import("../history.js").HistoryDiff<Patch>} options.strategy.diff -
 * Computes forward and inverse patches between selections.
 * @param {(current: Selection, patch: Patch) => Selection} options.strategy.apply -
 * Applies a recorded patch to the current selection.
 * @returns {HistoryControls} Controls bound to this store's history runtime.
 * - undo `() => void` - Replays the newest undo entry; cancels pending timers even
 * without an entry, does nothing after disposal, and throws inside a live group.
 * - redo `() => void` - Replays the newest redo entry with the same replay restrictions.
 * - canUndo `() => boolean` - Reports whether the undo stack contains an entry.
 * - canRedo `() => boolean` - Reports whether the redo stack contains an entry.
 * - clearHistory `() => void` - Clears both stacks and pending replay bookkeeping,
 * establishes a new commit baseline, and publishes status unless disposed.
 * - group `<T>(action: () => T) => T` - Runs an action synchronously and returns its
 * result, combining recorded changes under one group identity. Nested groups share
 * that identity. Throws for thenable results while live; does not roll back writes.
 * - pauseHistory `() => void` - Pauses recording of ordinary changes without
 * preventing replay; changed commits still invalidate redo.
 * - resumeHistory `() => void` - Resumes recording unless disposed.
 * - getHistoryStatus `() => HistoryStatus` - Returns the current immutable status snapshot.
 * - subscribeHistory `(listener: (status: HistoryStatus) => void) => () => void` - Subscribes to subsequent status commits and returns an unsubscribe function.
 * Existing listeners receive terminal disposal status; subscriptions after disposal
 * return a no-op unsubscribe function.
 * @example
 * ```ts
 * const store = new Store({ count: 0, title: 'Counter' });
 * const history = createHistoryRuntime(store, {
 *   limit: 50,
 *   select: (state) => state.count,
 *   restore: (current, count) => ({ ...current, count }),
 *   filter: undefined,
 *   isEqual: Object.is,
 *   strategy: undefined,
 * });
 *
 * history.group(() => {
 *   store.setState((state) => ({ ...state, count: 1 }));
 *   store.setState((state) => ({ ...state, count: 2 }));
 * });
 * history.undo(); // Restores count to 0 in one operation.
 * history.redo(); // Restores count to 2.
 * const stop = history.subscribeHistory((status) => {
 *   console.log(status.canUndo, status.redoDepth);
 * });
 * history.clearHistory();
 * stop();
 * ```
 */
export function createHistoryRuntime<State, Selection, Patch>(
  store: Store<State>,
  options: RuntimeOptions<State, Selection, Patch>,
): HistoryControls {
  const undoStack: HistoryEntry<Selection>[] = [];
  const redoStack: HistoryEntry<Selection>[] = [];
  const metadata = new Store(initialHistoryStatus);
  const subscriptions = new Set<() => void>();
  const pendingContexts = new Map<number, DispatchContext<State, Selection>>();
  const replayQueue: {
    source: HistoryEntry<Selection>[];
    target: HistoryEntry<Selection>[];
    direction: 'undo' | 'redo';
    sequence: number;
  }[] = [];
  let drainingReplays = false;
  let activeContext: DispatchContext<State, Selection> | undefined;
  let pendingReplay: Replay<State, Selection> | undefined;
  let observedSequence = store.getCommitSequence();
  let baseline = observedSequence;
  let group: object | undefined;
  let groupDepth = 0;
  let paused = false;
  let disposed = false;

  const publish = (): void => {
    metadata.set(Object.freeze({
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      undoDepth: undoStack.length,
      redoDepth: redoStack.length,
      isPaused: paused,
      isGrouping: groupDepth > 0,
      disposed,
    }));
  };
  const push = (stack: HistoryEntry<Selection>[], entry: HistoryEntry<Selection>): void => {
    if (options.limit === 0) return;
    if (stack.length === options.limit) stack.shift();
    stack.push(entry);
  };
  const step = (previous: Selection, next: Selection): HistoryStep<Selection> => {
    const strategy = options.strategy;
    if (strategy === undefined) {
      return { undo: () => previous, redo: () => next };
    }
    const { forward, inverse } = strategy.diff(previous, next);
    return {
      undo: (current) => strategy.apply(current, inverse),
      redo: (current) => strategy.apply(current, forward),
    };
  };
  const clear = (): void => {
    undoStack.length = 0;
    redoStack.length = 0;
    baseline = store.getCommitSequence();
    pendingContexts.clear();
    pendingReplay = undefined;
    replayQueue.length = 0;
  };
  const clearHistory = (): void => {
    if (disposed) return;
    clear();
    publish();
  };

  // The registry Store queues reentrant notifications. Contexts are captured
  // while dispatch is still on the stack, then matched to those commit sequences.
  // A single global "replaying" flag would incorrectly suppress user writes.
  store.unshiftMiddleware((action, next) => {
    if (disposed) {
      runWithTimerReplay(store, false, () => next(action));
      return;
    }
    const parent = activeContext;
    const context: DispatchContext<State, Selection> = {
      replay: pendingReplay?.action === action ? pendingReplay : undefined,
      group,
      paused,
    };
    const before = store.getCommitSequence();
    activeContext = context;
    try {
      runWithTimerReplay(store, context.replay !== undefined, () => next(action));
    } finally {
      for (let sequence = Math.max(before, observedSequence) + 1;
        !disposed && sequence <= store.getCommitSequence(); sequence += 1) {
        if (!pendingContexts.has(sequence)) {
          pendingContexts.set(sequence, context);
          if (context.replay) context.replay.scheduled = true;
        }
      }
      activeContext = parent;
    }
  });

  const recordCommit = (commit: StoreCommit<State>): void => {
    observedSequence = commit.sequence;
    const context = pendingContexts.get(commit.sequence) ?? activeContext;
    pendingContexts.delete(commit.sequence);
    if (disposed || commit.sequence <= baseline) return;
    if (commit.source === restoreSource || commit.source === devtoolsRestoreSource) {
      undoStack.length = 0;
      redoStack.length = 0;
      baseline = commit.sequence;
      pendingReplay = undefined;
      replayQueue.length = 0;
      publish();
      return;
    }
    const request = context?.replay;
    const replay = request?.firstSequence !== undefined && commit.sequence >= request.firstSequence
      ? request : undefined;
    const ownsReplay = replay && !replay.consumed && replay.source.at(-1) === replay.entry;
    let previous: Selection;
    let next: Selection;
    let recordedStep: HistoryStep<Selection> | undefined;
    let changed: boolean;
    try {
      previous = options.select(commit.previousState);
      next = options.select(commit.state);
      changed = !options.isEqual(previous, next);
      if (ownsReplay && changed) {
        recordedStep = replay.direction === 'undo' ? step(next, previous) : step(previous, next);
      } else if (changed && !(context?.paused ?? paused) &&
        (options.filter?.(commit.previousState, commit.state) ?? true)) {
        recordedStep = step(previous, next);
      }
    } catch (cause) {
      // A committed state cannot be rolled back when a pure hook fails. Drop
      // incompatible patches instead of leaving an apparently usable timeline.
      clear();
      try {
        publish();
      } catch (notificationError) {
        throw new AggregateError([cause, notificationError], 'History recording failed');
      }
      throw cause;
    }

    if (replay && !replay.consumed) {
      replay.consumed = true;
      if (pendingReplay === replay) pendingReplay = undefined;
      if (ownsReplay && !changed) return;
      if (ownsReplay && recordedStep) {
        replay.source.pop();
        push(replay.target, { steps: [recordedStep], group: undefined });
        publish();
        return;
      }
    }
    if (!changed) return;
    const hadRedo = redoStack.length > 0;
    redoStack.length = 0;
    if (recordedStep) {
      const currentGroup = context ? context.group : group;
      const last = undoStack.at(-1);
      if (currentGroup !== undefined && last?.group === currentGroup) {
        last.steps.push(recordedStep);
      } else {
        push(undoStack, { steps: [recordedStep], group: currentGroup });
      }
    }
    if (recordedStep || hadRedo) publish();
  };

  const replay = (
    source: HistoryEntry<Selection>[],
    target: HistoryEntry<Selection>[],
    direction: 'undo' | 'redo',
  ): void => {
    if (disposed) return;
    if (groupDepth > 0) throw new TypeError('History replay is not allowed inside a group');
    if (pendingReplay || observedSequence < store.getCommitSequence()) {
      replayQueue.push({ source, target, direction, sequence: store.getCommitSequence() });
      return;
    }
    // Replay operates only on committed history. Discard pending user intent,
    // including when there is no entry, rather than silently committing it.
    cancelStoreTimers(store);
    const entry = source.at(-1);
    if (!entry) return;
    const current = store.getState();
    const selected = options.select(current);
    let restored = selected;
    const steps = direction === 'undo' ? [...entry.steps].reverse() : entry.steps;
    for (const recorded of steps) restored = recorded[direction](restored);
    // A net-zero group is still one recorded operation. Consume it even when
    // replay needs no body commit; a middleware-rejected write is not consumed.
    if (options.isEqual(selected, restored)) {
      source.pop();
      push(target, entry);
      publish();
      return;
    }
    const request: Replay<State, Selection> = {
      action: (actual) => {
        const next = options.restore(actual, restored);
        request.firstSequence ??= store.getCommitSequence() + 1;
        return next;
      },
      entry, source, target, direction, firstSequence: undefined, scheduled: false, consumed: false,
    };
    pendingReplay = request;
    try {
      runWithStoreActionMetadata(store, { type: `history/${direction}` }, () => {
        store.setState(request.action);
      });
    } finally {
      if (pendingReplay === request && (!request.scheduled || request.firstSequence === undefined)) {
        pendingReplay = undefined;
      }
    }
  };

  const drainReplays = (): void => {
    if (drainingReplays) return;
    drainingReplays = true;
    try {
      while (!pendingReplay && replayQueue.length > 0) {
        const request = replayQueue[0];
        if (request.sequence > observedSequence) break;
        replayQueue.shift();
        replay(request.source, request.target, request.direction);
      }
    } finally {
      drainingReplays = false;
    }
  };
  const unsubscribe = store.subscribeCommit((commit) => {
    try {
      recordCommit(commit);
    } finally {
      drainReplays();
    }
  });

  const unregisterBaseline = registerRestoreBaseline(store, clearHistory);
  registerStoreCleanup(store, () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    unregisterBaseline();
    clear();
    groupDepth = 0;
    group = undefined;
    const stopTerminal = metadata.subscribeCommit((commit) => {
      if (!commit.state.disposed) return;
      for (const stop of subscriptions) stop();
      subscriptions.clear();
      stopTerminal();
    });
    publish();
  });

  return {
    undo: () => replay(undoStack, redoStack, 'undo'),
    redo: () => replay(redoStack, undoStack, 'redo'),
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    clearHistory,
    group: (action) => {
      if (disposed) return action();
      if (groupDepth === 0) group = {};
      groupDepth += 1;
      try {
        publish();
        const result = action();
        if (result !== null && (typeof result === 'object' || typeof result === 'function') &&
          'then' in result && typeof result.then === 'function') {
          throw new TypeError('History groups must be synchronous');
        }
        return result;
      } finally {
        if (!disposed) {
          groupDepth -= 1;
          if (groupDepth === 0) group = undefined;
          publish();
        }
      }
    },
    pauseHistory: () => {
      if (disposed || paused) return;
      paused = true;
      publish();
    },
    resumeHistory: () => {
      if (disposed || !paused) return;
      paused = false;
      publish();
    },
    getHistoryStatus: () => metadata.getState(),
    subscribeHistory: (listener) => {
      if (disposed) return () => undefined;
      const stop = metadata.subscribeCommit((commit) => listener(commit.state));
      subscriptions.add(stop);
      return () => {
        stop();
        subscriptions.delete(stop);
      };
    },
  };
}
