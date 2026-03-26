import { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStoreFromProps';
import type { ActionStore, NextState, StoreInput } from './shared';

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
  initialState: StoreInput<T>,
  options: LoggerOptions = DEFAULT_LOGGER_OPTIONS,
) => {
  const store = getStore(initialState) as ActionStore<T>;
  const baseSetState = store.setState.bind(store);
  const isProduction = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

  const setState = (nextState: NextState<T>, actionName: string = 'setStateAction') => {
    if (isProduction) {
      baseSetState(nextState, actionName);
      return;
    }

    const prevState = store.getState();
    const time = new Date().toLocaleTimeString();
    const logTitle = `State update: ${actionName}`;

    if (options.collapsed) {
      console.groupCollapsed(logTitle);
    } else {
      console.group(logTitle);
    }

    if (options.timestamp) {
      console.log('Time:', time);
    }

    console.log('Previous state:', prevState);

    baseSetState(nextState, actionName);
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
  };

  store.setState = setState;

  return store;
};

export function logger<T>(
  initialState: StoreInput<T>,
  options: LoggerOptions | undefined,
): Store<T>;
export function logger(options?: LoggerOptions): <T>(initialState: StoreInput<T>) => Store<T>;
export function logger<T>(first?: StoreInput<T> | LoggerOptions, second?: LoggerOptions) {
  if (arguments.length <= 1) {
    const options = first as LoggerOptions | undefined;

    return <State>(initialState: StoreInput<State>) => applyLogger(initialState, options);
  }

  return applyLogger(first as StoreInput<T>, second);
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
