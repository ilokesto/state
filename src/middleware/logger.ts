import type { Store } from '@ilokesto/store';
import { getStoreActionMetadata } from '../lib/actionMetadata.js';
import { getStore } from '../lib/getStore.js';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeAnyMiddleware, PipeMiddlewareMetadata } from '../utils/pipe/types.js';

type StoreSetStateAction<T> = Parameters<Store<T>['setState']>[0];

type LoggerOptions = {
  /** Whether to collapse each console group. Defaults to false. */
  collapsed?: boolean;
  /** Whether to log changes using JSON comparisons of top-level values. Defaults to false. */
  diff?: boolean;
  /** Whether to log a separate time entry; group titles always include the time. Defaults to true. */
  timestamp?: boolean;
};

type LoggerPipeMiddleware = PipeableMiddleware<
  PipeAnyMiddleware,
  PipeMiddlewareMetadata<'@ilokesto/state/logger', readonly [], readonly [], 'reject', readonly []>
>;

const DEFAULT_LOGGER_OPTIONS: LoggerOptions = { collapsed: false, diff: false, timestamp: true };

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const getValueForKey = (value: unknown, key: string) => {
  return isRecord(value) ? value[key] : value;
};

const applyLogger = <T>(initialState: T | Store<T>, options: LoggerOptions) => {
  const store = getStore(initialState);
  const isProduction = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

  store.pushMiddleware((nextState: StoreSetStateAction<T>, next) => {
    if (isProduction) {
      next(nextState);
      return;
    }

    const prevState = store.getState();
    const time = new Date().toLocaleTimeString();
    const actionType = getStoreActionMetadata(store)?.type ?? 'anonymous action';
    const logTitle = `State update: ${actionType} @ ${time}`;

    if (options.collapsed) {
      console.groupCollapsed(logTitle);
    } else {
      console.group(logTitle);
    }

    if (options.timestamp) {
      console.log('Time:', time);
    }

    console.log('Previous state:', prevState);

    next(nextState);
    const newState = store.getState();

    console.log('Next state:', newState);

    if (options.diff) {
      try {
        console.log('Changes:');
        const changes = getObjectDiff(prevState, newState);

        if ('value' in changes) {
          console.log(
            `  Value changed: ${JSON.stringify(prevState)} → ${JSON.stringify(newState)}`,
          );
        } else {
          Object.keys(changes).forEach((key) => {
            const prevValue = getValueForKey(prevState, key);
            const nextValue = getValueForKey(newState, key);

            console.log(`  ${key}: ${JSON.stringify(prevValue)} → ${JSON.stringify(nextValue)}`);
          });
        }
      } catch {
        console.log('Could not calculate changes');
      }
    }

    console.groupEnd();
  });

  return store;
};

/**
 * @description Creates pipe middleware that logs state updates to the console.
 * Logs the action type (or "anonymous action"), previous state, and next state
 * in a group whose title includes the local time. Logging is disabled when
 * `NODE_ENV === 'production'`; state updates still proceed normally.
 *
 * Optional diffs compare JSON representations of top-level object values.
 * Non-object states are compared directly. Diff calculation failures are
 * reported in the console rather than propagated.
 *
 * @param {LoggerOptions} [options] - Logging configuration.
 * @param {boolean} [options.collapsed] - Use `console.groupCollapsed` instead of `console.group`. Defaults to false.
 * @param {boolean} [options.diff] - Log changed top-level keys or a changed non-object value. Defaults to false.
 * @param {boolean} [options.timestamp] - Include a separate time entry. Defaults to true; the group title always includes the time.
 * @returns {LoggerPipeMiddleware} Middleware that installs logging and returns the resolved store.
 * - pipeMiddlewareMetadataBrand `PipeMiddlewareMetadata<'@ilokesto/state/logger', readonly [], readonly [], 'reject', readonly []>` - Branded metadata used by pipe composition.
 * : pipeMiddlewareMetadataBrand.adds `readonly []` - No capabilities are added.
 * : pipeMiddlewareMetadataBrand.after `readonly []` - No middleware must precede this middleware.
 * : pipeMiddlewareMetadataBrand.before `readonly []` - No middleware must follow this middleware.
 * : pipeMiddlewareMetadataBrand.conflicts `readonly []` - No conflicting middleware identifiers are declared.
 * : pipeMiddlewareMetadataBrand.duplicate `'reject'` - Duplicate logger registrations are rejected.
 * : pipeMiddlewareMetadataBrand.id `'@ilokesto/state/logger'` - Identifier used for composition validation.
 * : pipeMiddlewareMetadataBrand.requires `readonly []` - No capabilities are required.
 * - pipeStateMismatchKindBrand `LoggerPipeMiddleware[typeof pipeStateMismatchKindBrand]` - Type-level state compatibility marker, not a logging option or runtime control.
 * @example
 * ```ts
 * import { logger } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const store = pipe
 *   .use(logger({ collapsed: true, diff: true }))
 *   .create({ count: 0 });
 *
 * store.setState({ count: 1 });
 * // Outside production, logs the previous state, next state, and count change.
 * ```
 */
export function logger(options?: LoggerOptions): LoggerPipeMiddleware {
  const resolvedOptions = { ...DEFAULT_LOGGER_OPTIONS, ...options };
  const middleware: PipeAnyMiddleware = (initialState) => applyLogger(initialState, resolvedOptions);
  return definePipeableMiddleware(middleware, {
    adds: [],
    after: [],
    before: [],
    conflicts: [],
    duplicate: 'reject',
    id: '@ilokesto/state/logger',
    requires: [],
  } as const);
}

function getObjectDiff(prev: unknown, next: unknown) {
  const changes: Record<string, boolean> = {};

  if (typeof prev !== 'object' || prev === null || typeof next !== 'object' || next === null) {
    if (prev !== next) {
      changes['value'] = true;
    }

    return changes;
  }

  const allKeys = new Set([...Object.keys(prev as object), ...Object.keys(next as object)]);

  allKeys.forEach((key) => {
    try {
      const prevValue = (prev as Record<string, unknown>)[key];
      const nextValue = (next as Record<string, unknown>)[key];

      if (JSON.stringify(prevValue) !== JSON.stringify(nextValue)) {
        changes[key] = true;
      }
    } catch {
      changes[key] = true;
    }
  });

  return changes;
}
