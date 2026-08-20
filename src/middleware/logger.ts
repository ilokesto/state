import type { Store } from '@ilokesto/store';
import { getStoreActionMetadata } from '../lib/actionMetadata.js';
import { getStore } from '../lib/getStore.js';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeAnyMiddleware, PipeMiddlewareMetadata } from '../utils/pipe/types.js';

type StoreSetStateAction<T> = Parameters<Store<T>['setState']>[0];

type LoggerOptions = {
  collapsed?: boolean;
  diff?: boolean;
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

const applyLogger = <T>(
  initialState: T | Store<T>,
  options: LoggerOptions = DEFAULT_LOGGER_OPTIONS,
) => {
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
 * Create a pipe middleware that logs state updates to the console.
 *
 * Logs the action type, previous state, and next state on each update.
 * Automatically disabled in production (`NODE_ENV === 'production'`).
 *
 * @param options - Logging configuration.
 * @param options.collapsed - Use `console.groupCollapsed` instead of `console.group`. Defaults to `false`.
 * @param options.diff - Log a per-key diff between previous and next state. Defaults to `false`.
 * @param options.timestamp - Include a timestamp in the log. Defaults to `true`.
 * @returns Pipe middleware registered with `@ilokesto/state/logger` metadata.
 *
 * @example
 * ```ts
 * import { logger } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const store = pipe.use(logger({ diff: true })).create({ count: 0 });
 * ```
 */
export function logger(options?: LoggerOptions): LoggerPipeMiddleware {
  const middleware: PipeAnyMiddleware = (initialState) => applyLogger(initialState, options);
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
