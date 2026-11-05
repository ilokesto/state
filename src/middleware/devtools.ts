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
export type DevtoolsAction = string | {
  /** Action label displayed by the extension. */
  readonly type: string;
  /** Additional reducer action fields, including any payload. */
  readonly [key: string]: unknown;
};

/** Serialization settings forwarded to Redux DevTools, not to persistence. */
export type DevtoolsSerializeOptions = boolean | {
  /** Enable extended serialization globally or for selected value categories. */
  readonly options?: boolean | Readonly<Partial<Record<
    'date' | 'regex' | 'undefined' | 'nan' | 'infinity' | 'error' | 'symbol' | 'map' | 'set',
    boolean
  >>>;
  /** Transform values during extension serialization. */
  readonly replacer?: (key: string, value: unknown) => unknown;
  /** Revive serialized values; also used by the default replay decoder. */
  readonly reviver?: (key: string, value: unknown) => unknown;
};

/** Optional observation settings. Sanitizers receive detached, structured-cloneable values. */
export type DevtoolsOptions = {
  /** Defaults to false in production and true elsewhere. */
  readonly enabled?: boolean;
  /** Transform a detached state snapshot before sending it to the extension. */
  readonly stateSanitizer?: (state: unknown) => unknown;
  /** Transform a detached action before sending it to the extension. */
  readonly actionSanitizer?: (action: DevtoolsAction) => DevtoolsAction;
  /** Configure extension serialization without changing persistence serialization. */
  readonly serialize?: DevtoolsSerializeOptions;
  /** Decode extension state for replay. Defaults to JSON.parse with serialize.reviver. */
  readonly deserializeState?: (state: string) => unknown;
};

type DevtoolsConnection = {
  /** Initialize or reset the extension's displayed state baseline. */
  init: (state: unknown) => void;
  /** Listen for extension messages, optionally returning a subscription cleanup. */
  subscribe: (listener: (message: unknown) => void) => (() => void) | undefined;
  /** Stop listening when subscribe does not provide its own cleanup. */
  unsubscribe?: () => void;
  /** Report a committed action and its resulting state to the extension. */
  send: (action: DevtoolsAction, state: unknown) => void;
};

type DevtoolsObservation = {
  /** Action associated with a commit; undefined when action preparation failed. */
  readonly action: DevtoolsAction | undefined;
  /** Whether this observation belongs to an extension-driven dispatch. */
  readonly suppressed: boolean;
};

type ReduxDevtoolsExtension = {
  /** Open an extension connection with a display name and serialization settings. */
  connect: (options: {
    /** Store label displayed by Redux DevTools. */
    name: string;
    /** Serialization settings forwarded to the extension. */
    serialize?: DevtoolsSerializeOptions;
  }) => DevtoolsConnection;
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
        runDispatchAction(() => { store.setState(() => store.getInitialState()); });
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
 * @description Creates pipe middleware connecting a store to the Redux DevTools
 * browser extension. Accepts either a name with optional settings or a settings
 * object containing the name. Returns the store unchanged when disabled or when
 * the extension is unavailable.
 *
 * Supports `RESET`, `COMMIT`, `ROLLBACK`, `JUMP_TO_STATE`, and `JUMP_TO_ACTION`.
 * Disabled in production unless explicitly enabled. Jumps validate the incoming
 * state, replace it immediately, and clear the local undo/redo baseline.
 * Committed changes are reported with action metadata when available.
 * Extension-driven updates are not echoed back as ordinary actions.
 * Store cleanup stops observation and releases the extension subscription.
 * Sanitization and sending failures are logged; malformed replay messages or
 * asynchronous deserialization results throw.
 *
 * @param {string} name - Label shown in the DevTools extension for the string overload.
 * @param {DevtoolsOptions & { readonly name?: string }} [options] - Optional settings
 * after a string name, or the required named settings object in the object overload.
 * @param {boolean | undefined} [options.enabled] - Override the default of enabled
 * outside production and disabled in production.
 * @param {((state: unknown) => unknown) | undefined} [options.stateSanitizer] -
 * Transform a detached state snapshot before extension initialization or reporting.
 * @param {((action: DevtoolsAction) => DevtoolsAction) | undefined} [options.actionSanitizer] -
 * Transform a detached action before reporting it to the extension.
 * @param {DevtoolsSerializeOptions | undefined} [options.serialize] - Extension
 * serialization settings, independent of persistence; specifying this also causes
 * outgoing states and actions to be cloned before processing.
 * @param {boolean | Readonly<Partial<Record<'date' | 'regex' | 'undefined' | 'nan' | 'infinity' | 'error' | 'symbol' | 'map' | 'set', boolean>>> | undefined} [options.serialize.options] -
 * Enable extended serialization globally or for selected categories when serialize is an object.
 * @param {((key: string, value: unknown) => unknown) | undefined} [options.serialize.replacer] -
 * Transform values during extension serialization when serialize is an object.
 * @param {((key: string, value: unknown) => unknown) | undefined} [options.serialize.reviver] -
 * Revive serialized values; also passed to JSON.parse by the default replay decoder.
 * @param {((state: string) => unknown) | undefined} [options.deserializeState] -
 * Synchronously decode replay state instead of using JSON.parse with the configured
 * reviver. Returning a Promise is rejected.
 * @param {string} options.name - Required display name in the object overload;
 * the string overload uses its separate name argument instead.
 * @returns {CurriedDevtools} Middleware registered with
 * `@ilokesto/state/devtools` metadata. In the member types below, Metadata means
 * `PipeMiddlewareMetadata<'@ilokesto/state/devtools', readonly [], readonly [], 'reject', readonly []>`;
 * MetadataBrand and StateMismatchBrand denote the corresponding unique-symbol
 * keys of CurriedDevtools.
 * - pipeMiddlewareMetadataBrand `CurriedDevtools[MetadataBrand]` - Static middleware composition metadata.
 * : pipeMiddlewareMetadataBrand.adds `readonly []` - Adds no declared capabilities.
 * : pipeMiddlewareMetadataBrand.after `Metadata['after']` - Declares no explicit after-order constraints.
 * : pipeMiddlewareMetadataBrand.before `Metadata['before']` - Declares no explicit before-order constraints.
 * : pipeMiddlewareMetadataBrand.conflicts `readonly []` - Declares no conflicting middleware identifiers.
 * : pipeMiddlewareMetadataBrand.duplicate `'reject'` - Rejects duplicate registration.
 * : pipeMiddlewareMetadataBrand.id `'@ilokesto/state/devtools'` - Stable middleware identifier.
 * : pipeMiddlewareMetadataBrand.requires `readonly []` - Requires no declared capabilities.
 * - pipeStateMismatchKindBrand `CurriedDevtools[StateMismatchBrand]` - Type-level state-compatibility marker for pipe composition.
 * @example
 * ```ts
 * import { devtools } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const store = pipe.use(devtools('counter')).create({ count: 0 });
 * store.setState({ count: 1 });
 *
 * const inspectedStore = pipe.use(devtools({
 *   name: 'debug counter',
 *   enabled: true,
 *   stateSanitizer: (state) => ({ count: (state as { count: number }).count }),
 * })).create({ count: 0 });
 * inspectedStore.setState({ count: 2 });
 * ```
 */
export function devtools(name: string, options?: DevtoolsOptions): CurriedDevtools;
/**
 * @description Creates pipe middleware connecting a store to the Redux DevTools
 * browser extension. Accepts either a name with optional settings or a settings
 * object containing the name. Returns the store unchanged when disabled or when
 * the extension is unavailable.
 *
 * Supports `RESET`, `COMMIT`, `ROLLBACK`, `JUMP_TO_STATE`, and `JUMP_TO_ACTION`.
 * Disabled in production unless explicitly enabled. Jumps validate the incoming
 * state, replace it immediately, and clear the local undo/redo baseline.
 * Committed changes are reported with action metadata when available.
 * Extension-driven updates are not echoed back as ordinary actions.
 * Store cleanup stops observation and releases the extension subscription.
 * Sanitization and sending failures are logged; malformed replay messages or
 * asynchronous deserialization results throw.
 *
 * @param {string} name - Label shown in the DevTools extension for the string overload.
 * @param {DevtoolsOptions & { readonly name?: string }} [options] - Optional settings
 * after a string name, or the required named settings object in the object overload.
 * @param {boolean | undefined} [options.enabled] - Override the default of enabled
 * outside production and disabled in production.
 * @param {((state: unknown) => unknown) | undefined} [options.stateSanitizer] -
 * Transform a detached state snapshot before extension initialization or reporting.
 * @param {((action: DevtoolsAction) => DevtoolsAction) | undefined} [options.actionSanitizer] -
 * Transform a detached action before reporting it to the extension.
 * @param {DevtoolsSerializeOptions | undefined} [options.serialize] - Extension
 * serialization settings, independent of persistence; specifying this also causes
 * outgoing states and actions to be cloned before processing.
 * @param {boolean | Readonly<Partial<Record<'date' | 'regex' | 'undefined' | 'nan' | 'infinity' | 'error' | 'symbol' | 'map' | 'set', boolean>>> | undefined} [options.serialize.options] -
 * Enable extended serialization globally or for selected categories when serialize is an object.
 * @param {((key: string, value: unknown) => unknown) | undefined} [options.serialize.replacer] -
 * Transform values during extension serialization when serialize is an object.
 * @param {((key: string, value: unknown) => unknown) | undefined} [options.serialize.reviver] -
 * Revive serialized values; also passed to JSON.parse by the default replay decoder.
 * @param {((state: string) => unknown) | undefined} [options.deserializeState] -
 * Synchronously decode replay state instead of using JSON.parse with the configured
 * reviver. Returning a Promise is rejected.
 * @param {string} options.name - Required display name in the object overload;
 * the string overload uses its separate name argument instead.
 * @returns {CurriedDevtools} Middleware registered with
 * `@ilokesto/state/devtools` metadata. In the member types below, Metadata means
 * `PipeMiddlewareMetadata<'@ilokesto/state/devtools', readonly [], readonly [], 'reject', readonly []>`;
 * MetadataBrand and StateMismatchBrand denote the corresponding unique-symbol
 * keys of CurriedDevtools.
 * - pipeMiddlewareMetadataBrand `CurriedDevtools[MetadataBrand]` - Static middleware composition metadata.
 * : pipeMiddlewareMetadataBrand.adds `readonly []` - Adds no declared capabilities.
 * : pipeMiddlewareMetadataBrand.after `Metadata['after']` - Declares no explicit after-order constraints.
 * : pipeMiddlewareMetadataBrand.before `Metadata['before']` - Declares no explicit before-order constraints.
 * : pipeMiddlewareMetadataBrand.conflicts `readonly []` - Declares no conflicting middleware identifiers.
 * : pipeMiddlewareMetadataBrand.duplicate `'reject'` - Rejects duplicate registration.
 * : pipeMiddlewareMetadataBrand.id `'@ilokesto/state/devtools'` - Stable middleware identifier.
 * : pipeMiddlewareMetadataBrand.requires `readonly []` - Requires no declared capabilities.
 * - pipeStateMismatchKindBrand `CurriedDevtools[StateMismatchBrand]` - Type-level state-compatibility marker for pipe composition.
 * @example
 * ```ts
 * import { devtools } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const store = pipe.use(devtools('counter')).create({ count: 0 });
 * store.setState({ count: 1 });
 *
 * const inspectedStore = pipe.use(devtools({
 *   name: 'debug counter',
 *   enabled: true,
 *   stateSanitizer: (state) => ({ count: (state as { count: number }).count }),
 * })).create({ count: 0 });
 * inspectedStore.setState({ count: 2 });
 * ```
 */
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
