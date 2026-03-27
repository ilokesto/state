import { Store } from '@ilokesto/store';
import { SetStateAction } from 'react';
import { getStore } from '../lib/getStore';

type LoggerOptions = {
  collapsed?: boolean;
  diff?: boolean;
  timestamp?: boolean;
};

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

  store.pushMiddleware((nextState: SetStateAction<T>, next) => {
    if (isProduction) {
      next(nextState);
      return;
    }

    const prevState = store.getState();
    const time = new Date().toLocaleTimeString();
    // @ts-ignore
    const logTitle = `State update: ${store.actionName ?? 'anonymous action'} @ ${time}`;

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

export function logger<T>(initialState: T | Store<T>, options: LoggerOptions | undefined): Store<T>;
export function logger(options?: LoggerOptions): <T>(initialState: T | Store<T>) => Store<T>;
export function logger<T>(first?: T | Store<T> | LoggerOptions, second?: LoggerOptions) {
  if (arguments.length <= 1) {
    const options = first as LoggerOptions | undefined;

    return (initialState: T | Store<T>) => applyLogger(initialState, options);
  }

  return applyLogger(first as T | Store<T>, second);
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
