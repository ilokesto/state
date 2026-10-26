import { Store } from '@ilokesto/store';
import type { StoreCommit } from '@ilokesto/store';
import { runWithStoreActionMetadata } from '../../lib/actionMetadata.js';
import { devtoolsRestoreSource, registerRestoreBaseline, restoreSource } from '../../lib/restoreSource.js';
import { registerStoreCleanup } from '../../lib/storeCleanup.js';
import type { HistoryControls, HistoryStatus, HistoryStrategy } from '../history.js';

type HistoryStep<Selection> = {
  readonly undo: (current: Selection) => Selection;
  readonly redo: (current: Selection) => Selection;
};
type HistoryEntry<Selection> = {
  readonly steps: HistoryStep<Selection>[];
  readonly group: object | undefined;
};
type Replay<State, Selection> = {
  readonly action: () => State;
  readonly entry: HistoryEntry<Selection>;
  readonly source: HistoryEntry<Selection>[];
  readonly target: HistoryEntry<Selection>[];
  readonly direction: 'undo' | 'redo';
  firstSequence: number | undefined;
  scheduled: boolean;
  consumed: boolean;
};
type DispatchContext<State, Selection> = {
  readonly replay: Replay<State, Selection> | undefined;
  readonly group: object | undefined;
  readonly paused: boolean;
};
type RuntimeOptions<State, Selection, Patch> = {
  readonly limit: number;
  readonly select: (state: Readonly<State>) => Selection;
  readonly restore: (current: Readonly<State>, selection: Selection) => State;
  readonly filter: ((previous: Readonly<State>, next: Readonly<State>) => boolean) | undefined;
  readonly isEqual: (previous: Selection, next: Selection) => boolean;
  readonly strategy: HistoryStrategy<Selection, Patch> | undefined;
};

export const initialHistoryStatus: HistoryStatus = Object.freeze({
  canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0,
  isPaused: false, isGrouping: false, disposed: false,
});

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
      next(action);
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
      next(action);
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
    const next = options.restore(current, restored);
    const request: Replay<State, Selection> = {
      action: () => {
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
    try {
      publish();
    } finally {
      for (const stop of subscriptions) stop();
      subscriptions.clear();
    }
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
