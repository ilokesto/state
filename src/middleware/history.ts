import { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStore.js';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type {
  PipeAnyMiddleware,
  PipeCapability,
  PipeMiddlewareMetadata,
} from '../utils/pipe/types.js';

/**
 * Options for the {@link history} middleware.
 */
export type HistoryOptions = {
  /** Maximum number of undo entries to retain. Must be a non-negative integer. Defaults to `300`. */
  readonly limit?: number;
};

/**
 * Undo/redo controls added to a store by the {@link history} middleware.
 */
export type HistoryControls = {
  /** Revert to the previous recorded state. */
  readonly undo: () => void;
  /** Re-apply the last undone state. */
  readonly redo: () => void;
  /** Returns `true` when at least one state can be undone. */
  readonly canUndo: () => boolean;
  /** Returns `true` when at least one state can be redone. */
  readonly canRedo: () => boolean;
  /** Remove all recorded history without changing the current state. */
  readonly clearHistory: () => void;
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

type HistoryPipeMiddleware = PipeableMiddleware<
  PipeAnyMiddleware<readonly [], readonly [HistoryCapability]>,
  PipeMiddlewareMetadata<
    '@ilokesto/state/history',
    readonly [],
    readonly [HistoryCapability],
    'reject',
    readonly ['@ilokesto/state/debounce', '@ilokesto/state/throttle']
  >
>;

type HistoryEntry<State> = {
  readonly state: Readonly<State>;
};

const DEFAULT_HISTORY_LIMIT = 300;
const historyControlKeys = [
  'undo',
  'redo',
  'canUndo',
  'canRedo',
  'clearHistory',
] as const satisfies readonly (keyof HistoryControls)[];
const historyCapability = {
  id: '@ilokesto/state/history-controls',
  shape: {
    undo: () => undefined,
    redo: () => undefined,
    canUndo: () => false,
    canRedo: () => false,
    clearHistory: () => undefined,
  },
} as const satisfies HistoryCapability;

function resolveHistoryLimit(options: unknown): number {
  const limit =
    typeof options === 'object' && options !== null && 'limit' in options
      ? options.limit
      : DEFAULT_HISTORY_LIMIT;
  if (
    typeof limit !== 'number' ||
    !Number.isFinite(limit) ||
    !Number.isInteger(limit) ||
    limit < 0
  ) {
    throw new RangeError('History limit must be a finite non-negative integer');
  }

  return limit;
}

function pushBounded<State>(
  stack: HistoryEntry<State>[],
  entry: HistoryEntry<State>,
  limit: number,
): void {
  if (limit === 0) {
    return;
  }
  if (stack.length === limit) {
    stack.shift();
  }
  stack.push(entry);
}

function defineHistoryControls<State>(
  store: Store<State>,
  controls: HistoryControls,
): asserts store is HistoryStore<State> {
  Object.defineProperties(store, {
    undo: { configurable: false, enumerable: true, value: controls.undo, writable: false },
    redo: { configurable: false, enumerable: true, value: controls.redo, writable: false },
    canUndo: {
      configurable: false,
      enumerable: true,
      value: controls.canUndo,
      writable: false,
    },
    canRedo: {
      configurable: false,
      enumerable: true,
      value: controls.canRedo,
      writable: false,
    },
    clearHistory: {
      configurable: false,
      enumerable: true,
      value: controls.clearHistory,
      writable: false,
    },
  });
}

function applyHistory<State>(
  initialState: State | Store<State>,
  limit: number,
): HistoryStore<State> {
  const store = getStore(initialState);
  for (const key of historyControlKeys) {
    if (key in store) {
      throw new HistoryConfigurationError('CONTROL_COLLISION', key);
    }
  }

  const undoStack: HistoryEntry<State>[] = [];
  const redoStack: HistoryEntry<State>[] = [];
  let isReplaying = false;

  const replay = (source: HistoryEntry<State>[], target: HistoryEntry<State>[]): void => {
    const entry = source.at(-1);
    if (entry === undefined) {
      return;
    }

    const current = store.getState();
    isReplaying = true;
    try {
      store.setState(entry.state);
    } finally {
      isReplaying = false;
    }
    if (Object.is(current, store.getState())) {
      return;
    }

    source.pop();
    pushBounded(target, { state: current }, limit);
  };

  const controls: HistoryControls = {
    undo: () => replay(undoStack, redoStack),
    redo: () => replay(redoStack, undoStack),
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    clearHistory: () => {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };

  store.pushMiddleware((nextState, next) => {
    const before = store.getState();
    next(nextState);
    if (isReplaying || Object.is(before, store.getState())) {
      return;
    }

    pushBounded(undoStack, { state: before }, limit);
    redoStack.length = 0;
  });
  defineHistoryControls(store, controls);
  return store;
}

/**
 * Create a pipe middleware that records state changes for undo/redo.
 *
 * Adds `undo()`, `redo()`, `canUndo()`, `canRedo()`, and `clearHistory()`
 * to the store. Only successful synchronous state changes are recorded;
 * replayed states (undo/redo) are not re-recorded.
 *
 * Cannot share a pipe chain with `debounce()` or `throttle()` — delayed
 * updates lack the synchronous commit boundary history requires.
 *
 * @param options - Configuration.
 * @param options.limit - Maximum history entries. Defaults to `300`.
 * @returns Pipe middleware registered with `@ilokesto/state/history` metadata.
 *
 * @example
 * ```ts
 * import { history } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const store = pipe.use(history({ limit: 50 })).create({ count: 0 });
 * store.setState({ count: 1 });
 * store.undo(); // count: 0
 * store.redo(); // count: 1
 * ```
 */
export function history(options?: HistoryOptions): HistoryPipeMiddleware {
  const limit = resolveHistoryLimit(options);
  const middleware: PipeAnyMiddleware<readonly [], readonly [HistoryCapability]> = (store) =>
    applyHistory(store, limit);

  return definePipeableMiddleware(middleware, {
    adds: [historyCapability],
    after: [],
    before: [],
    conflicts: ['@ilokesto/state/debounce', '@ilokesto/state/throttle'],
    duplicate: 'reject',
    id: '@ilokesto/state/history',
    requires: [],
  } as const);
}
