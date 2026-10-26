import { Store } from '@ilokesto/store';
import { getDispatchedStoreAction, getStoreActionMetadata } from '../lib/actionMetadata.js';
import { getStore } from '../lib/getStore.js';
import { devtoolsRestoreSource, resetRestoreBaseline, restoreSource } from '../lib/restoreSource.js';
import { validateState } from '../lib/stateValidation.js';
import { registerStoreCleanup } from '../lib/storeCleanup.js';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeAnyMiddleware, PipeMiddlewareMetadata } from '../utils/pipe/types.js';

type StoreSetStateAction<T> = Parameters<Store<T>['setState']>[0];

type CurriedDevtools = PipeableMiddleware<
  PipeAnyMiddleware,
  PipeMiddlewareMetadata<'@ilokesto/state/devtools', readonly [], readonly [], 'reject', readonly []>
>;

/** An extension action: legacy labels or a reducer action including its payload. */
export type DevtoolsAction = string | { readonly type: string; readonly [key: string]: unknown };

/** Serialization settings forwarded to Redux DevTools, not to persistence. */
export type DevtoolsSerializeOptions = boolean | {
  readonly options?: boolean | Readonly<Partial<Record<
    'date' | 'regex' | 'undefined' | 'nan' | 'infinity' | 'error' | 'symbol' | 'map' | 'set',
    boolean
  >>>;
  readonly replacer?: (key: string, value: unknown) => unknown;
  readonly reviver?: (key: string, value: unknown) => unknown;
};

/** Optional observation settings. Sanitizers receive detached, structured-cloneable values. */
export type DevtoolsOptions = {
  /** Defaults to false in production and true elsewhere. */
  readonly enabled?: boolean;
  readonly stateSanitizer?: (state: unknown) => unknown;
  readonly actionSanitizer?: (action: DevtoolsAction) => DevtoolsAction;
  readonly serialize?: DevtoolsSerializeOptions;
  /** Decode extension state for replay. Defaults to JSON.parse with serialize.reviver. */
  readonly deserializeState?: (state: string) => unknown;
};

type DevtoolsConnection = {
  init: (state: unknown) => void;
  subscribe: (listener: (message: unknown) => void) => (() => void) | undefined;
  unsubscribe?: () => void;
  send: (action: DevtoolsAction, state: unknown) => void;
};

type DevtoolsObservation = {
  readonly action: DevtoolsAction | undefined;
  readonly suppressed: boolean;
};

type ReduxDevtoolsExtension = {
  connect: (options: { name: string; serialize?: DevtoolsSerializeOptions }) => DevtoolsConnection;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getDevtoolsExtension = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return (window as Window & { __REDUX_DEVTOOLS_EXTENSION__?: ReduxDevtoolsExtension })
    .__REDUX_DEVTOOLS_EXTENSION__;
};

const applyDevtools = <T>(initialState: T | Store<T>, name: string, options: DevtoolsOptions) => {
  const store = getStore(initialState);
  const isProduction = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
  const devTools = (options.enabled ?? !isProduction) && getDevtoolsExtension()?.connect({
    name,
    ...(options.serialize === undefined ? {} : { serialize: options.serialize }),
  });
  if (!devTools) {
    return store;
  }

  let isDisposed = false;
  let isDispatchAction = false;
  const activeDispatches = new Set<object>();
  const observations = new Map<number, DevtoolsObservation>();
  let activeObservation: DevtoolsObservation | undefined;
  let observedSequence = store.getCommitSequence();

  const reportError = (error: unknown): void => {
    console.error('Error sending state to devtools', error instanceof Error ? error : new Error(String(error)));
  };
  const sanitizeState = (state: Readonly<T>): unknown => {
    const snapshot = options.stateSanitizer || options.serialize !== undefined
      ? structuredClone(state)
      : state;
    return options.stateSanitizer ? options.stateSanitizer(snapshot) : snapshot;
  };
  const initialize = (): void => {
    if (isDisposed) return;
    try {
      const state = sanitizeState(store.getState());
      if (!isDisposed) devTools.init(state);
    } catch (error) {
      reportError(error);
    }
  };
  const send = (action: DevtoolsAction, state: Readonly<T>): void => {
    if (isDisposed) return;
    try {
      const snapshot = options.actionSanitizer || options.serialize !== undefined
        ? structuredClone(action)
        : action;
      const sanitizedAction = options.actionSanitizer ? options.actionSanitizer(snapshot) : snapshot;
      const sanitizedState = sanitizeState(state);
      if (!isDisposed) devTools.send(sanitizedAction, sanitizedState);
    } catch (error) {
      reportError(error);
    }
  };

  const runDispatchAction = (action: () => void): void => {
    const wasDispatchAction = isDispatchAction;
    isDispatchAction = true;
    try {
      action();
    } finally {
      isDispatchAction = wasDispatchAction;
    }
  };

  registerStoreCleanup(store, () => {
    isDisposed = true;
    observations.clear();
  });
  initialize();
  if (isDisposed) return store;
  registerStoreCleanup(store, store.subscribeCommit((commit) => {
    const observation = observations.get(commit.sequence) ?? activeObservation;
    observedSequence = commit.sequence;
    observations.delete(commit.sequence);
    if (isDisposed || commit.source === devtoolsRestoreSource || observation?.suppressed) return;
    if (commit.source === restoreSource) {
      send(`${name}:persist/rehydrate`, commit.state);
      return;
    }
    if (observation && observation.action === undefined) return;
    send(observation?.action ?? `${name}:anonymous action`, commit.state);
  }));

  const unsubscribe = devTools.subscribe((message) => {
    if (isDisposed) return;
    if (!isRecord(message) || typeof message.type !== 'string') {
      throw new TypeError('Invalid DevTools message');
    }
    if (message.type !== 'DISPATCH') return;
    if (!isRecord(message.payload) || typeof message.payload.type !== 'string') {
      throw new TypeError('Invalid DevTools dispatch payload');
    }

    switch (message.payload.type) {
      case 'RESET':
        runDispatchAction(() => { store.setState(store.getInitialState()); });
        initialize();
        break;
      case 'COMMIT':
        initialize();
        break;
      case 'ROLLBACK':
      case 'JUMP_TO_STATE':
      case 'JUMP_TO_ACTION': {
        if (typeof message.state !== 'string') {
          throw new TypeError('DevTools replay requires a serialized state string');
        }
        const reviver = typeof options.serialize === 'object' ? options.serialize.reviver : undefined;
        const state: unknown = options.deserializeState
          ? options.deserializeState(message.state)
          : JSON.parse(message.state, reviver);
        if (state instanceof Promise) {
          throw new TypeError('DevTools state deserialization must be synchronous');
        }
        if (message.payload.type === 'ROLLBACK') {
          runDispatchAction(() => { store.setState(() => state as T); });
          break;
        }
        // A jump is immediate, even with timing middleware. Validate before
        // replacing, then start history at the new baseline. A distinct source
        // suppresses only this commit, not reentrant user edits or persistence.
        const validated = validateState(store, state as T);
        if ('issues' in validated) break;
        resetRestoreBaseline(store);
        store.replaceState(validated.value, devtoolsRestoreSource);
        break;
      }
      default:
        break;
    }
  });
  if (unsubscribe) {
    registerStoreCleanup(store, unsubscribe);
  } else if (devTools.unsubscribe) {
    registerStoreCleanup(store, () => { devTools.unsubscribe?.(); });
  }

  store.pushMiddleware((nextState: StoreSetStateAction<T>, next) => {
    if (isDisposed) {
      next(nextState);
      return;
    }
    const metadata = getStoreActionMetadata(store);
    const ownsMetadata = metadata !== undefined && !activeDispatches.has(metadata);
    const dispatched = ownsMetadata
      ? getDispatchedStoreAction(store)
      : undefined;
    const sequenceBefore = store.getCommitSequence();
    let action: DevtoolsAction | undefined;
    try {
      action = dispatched && metadata
        ? { ...dispatched, type: `${name}:${metadata.type}` }
        : `${name}:${ownsMetadata ? metadata.type : 'anonymous action'}`;
    } catch (error) {
      reportError(error);
    }
    const observation = {
      action,
      suppressed: isDispatchAction,
    };
    const previousObservation = activeObservation;
    activeObservation = observation;
    if (ownsMetadata) activeDispatches.add(metadata);
    try {
      next(nextState);
    } finally {
      if (ownsMetadata) activeDispatches.delete(metadata);
      activeObservation = previousObservation;
      // FIFO notifications from reentrant writes outlive this scope. Associate
      // their actual sequences only after committing; nested scopes win.
      if (!isDisposed) {
        for (let sequence = Math.max(sequenceBefore, observedSequence) + 1;
          sequence <= store.getCommitSequence(); sequence += 1) {
          if (!observations.has(sequence)) observations.set(sequence, observation);
        }
      }
    }
  });

  return store;
};

/**
 * Create a pipe middleware that connects the store to the Redux DevTools
 * browser extension.
 *
 * Supports `RESET`, `COMMIT`, `ROLLBACK`, `JUMP_TO_STATE`, and `JUMP_TO_ACTION`.
 * Disabled in production unless explicitly enabled. Jumps validate the incoming
 * state, replace it immediately, and clear the local undo/redo baseline.
 *
 * @param name - Label shown in the DevTools extension.
 * @returns Pipe middleware registered with `@ilokesto/state/devtools` metadata.
 *
 * @example
 * ```ts
 * import { devtools } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const store = pipe.use(devtools('counter')).create({ count: 0 });
 * ```
 */
export function devtools(name: string, options?: DevtoolsOptions): CurriedDevtools;
export function devtools(options: DevtoolsOptions & { readonly name: string }): CurriedDevtools;
export function devtools(
  nameOrOptions: string | (DevtoolsOptions & { readonly name: string }),
  options: DevtoolsOptions = {},
): CurriedDevtools {
  const name = typeof nameOrOptions === 'string' ? nameOrOptions : nameOrOptions.name;
  const settings = typeof nameOrOptions === 'string' ? options : nameOrOptions;
  return definePipeableMiddleware(
    <State>(initialState: State | Store<State>) => applyDevtools(initialState, name, settings),
    {
      adds: [],
      after: [],
      before: [],
      conflicts: [],
      duplicate: 'reject',
      id: '@ilokesto/state/devtools',
      requires: [],
    } as const,
  );
}
