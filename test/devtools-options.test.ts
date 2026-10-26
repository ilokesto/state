import { expect, spyOn, test } from 'bun:test';
import type { DevtoolsAction, DevtoolsOptions, DevtoolsSerializeOptions } from '../dist/middleware';
import { createReducer } from '../src/lib/createReducer';
import { runWithStoreActionMetadata } from '../src/lib/actionMetadata';
import { Store } from '@ilokesto/store';
import { devtools, dispose, history, jsonStorage, persist, validate } from '../src/middleware';
import { pipe } from '../src/utils/pipe';
import { definePipeableMiddleware } from '../src/utils/pipe/metadata';
import { restoreBrowserGlobal, withBrowserFakes } from './helpers/browserFakes';

function withExtension<Result>(run: (extension: {
  readonly options: unknown[];
  readonly inits: unknown[];
  readonly sends: { action: unknown; state: unknown }[];
  readonly commands: ((message: unknown) => void)[];
  readonly unsubscribed: number[];
}) => Result): Result {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const extension = {
    options: [] as unknown[],
    inits: [] as unknown[],
    sends: [] as { action: unknown; state: unknown }[],
    commands: [] as ((message: unknown) => void)[],
    unsubscribed: [] as number[],
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect(options: unknown) {
          const index = extension.options.push(options) - 1;
          return {
            init(state: unknown) { extension.inits.push(state); },
            send(action: unknown, state: unknown) { extension.sends.push({ action, state }); },
            subscribe(listener: (message: unknown) => void) {
              extension.commands.push(listener);
              return () => { extension.unsubscribed.push(index); };
            },
          };
        },
      },
    },
  });
  try {
    const result = run(extension);
    if (result instanceof Promise) {
      return result.finally(() => restoreBrowserGlobal('window', descriptor)) as Result;
    }
    restoreBrowserGlobal('window', descriptor);
    return result;
  } catch (error) {
    restoreBrowserGlobal('window', descriptor);
    throw error;
  }
}

const jump = (type: 'JUMP_TO_STATE' | 'JUMP_TO_ACTION', state: unknown) => ({
  type: 'DISPATCH', payload: { type }, state: JSON.stringify(state),
});

test('devtools: metadata-only replay with nested writes -> labels only the originating commit', () => {
  withExtension(({ sends }) => {
    const store = pipe.use(devtools('editor')).create({ count: 0 });
    let nested = false;
    store.subscribe(() => {
      if (!nested) {
        nested = true;
        store.set({ count: 2 });
        store.set({ count: 3 });
      }
    });

    runWithStoreActionMetadata(store, { type: 'history/undo' }, () => {
      store.set({ count: 1 });
    });

    expect(sends).toEqual([
      { action: 'editor:history/undo', state: { count: 1 } },
      { action: 'editor:anonymous action', state: { count: 2 } },
      { action: 'editor:anonymous action', state: { count: 3 } },
    ]);
    dispose(store);
  });
});

test('devtools: nested reducer dispatch and direct update -> payloads match each committed state', () => {
  withExtension(({ commands, sends }) => {
    const store = pipe.use(devtools('counter')).create({ count: 0 });
    const reducer = createReducer(
      (state: { count: number }, action: { type: string; payload: { amount: number } }) =>
        ({ count: state.count + action.payload.amount }),
      store,
    );
    let nested = false;
    store.subscribe(() => {
      if (nested) return;
      nested = true;
      reducer.dispatch({ type: 'inner', payload: { amount: 2 } });
      store.set({ count: 4 });
    });

    reducer.dispatch({ type: 'outer', payload: { amount: 1 } });

    expect(sends).toEqual([
      { action: { type: 'counter:outer', payload: { amount: 1 } }, state: { count: 1 } },
      { action: { type: 'counter:inner', payload: { amount: 2 } }, state: { count: 3 } },
      { action: 'counter:anonymous action', state: { count: 4 } },
    ]);
    commands[0](jump('JUMP_TO_ACTION', { count: 8 }));
    expect(store.getState()).toEqual({ count: 8 });
    expect(sends).toHaveLength(3);
  });
});

test('devtools: mutating sanitizers -> extension receives redaction without changing state or payload', () => {
  withExtension(({ inits, sends }) => {
    const initial = { nested: { secret: 'initial' } };
    const store = pipe.use(devtools('private', {
      stateSanitizer(state) {
        if (typeof state === 'object' && state !== null && 'nested' in state) {
          Reflect.set(state.nested as object, 'secret', 'redacted');
        }
        return state;
      },
      actionSanitizer(action) {
        if (typeof action !== 'string' && typeof action.payload === 'object' && action.payload !== null) {
          Reflect.set(action.payload, 'secret', 'redacted');
        }
        return action;
      },
    })).create(initial);
    const reducer = createReducer(
      (_state: typeof initial, action: { type: string; payload: { secret: string } }) =>
        ({ nested: action.payload }),
      store,
    );
    const action = { type: 'set', payload: { secret: 'next' } };

    reducer.dispatch(action);

    expect(initial.nested.secret).toBe('initial');
    expect(action.payload.secret).toBe('next');
    expect(store.getState().nested.secret).toBe('next');
    expect(inits).toEqual([{ nested: { secret: 'redacted' } }]);
    expect(sends).toEqual([{
      action: { type: 'private:set', payload: { secret: 'redacted' } },
      state: { nested: { secret: 'redacted' } },
    }]);
  });
});

test('devtools: explicit enabled option -> overrides production default without changing legacy calls', () => {
  const environment = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    withExtension(({ options }) => {
      devtools('default')(new Store(0));
      devtools('off', { enabled: false })(new Store(0));
      devtools({ name: 'on', enabled: true, serialize: true })(new Store(0));

      expect(options).toEqual([{ name: 'on', serialize: true }]);
    });
  } finally {
    if (environment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = environment;
  }
});

test('devtools: malformed commands -> reject before mutation and leave subsequent sends enabled', () => {
  withExtension(({ commands, sends }) => {
    const store = devtools('boundary')(new Store(0));
    for (const message of [
      null, 3, [], {}, { type: 'DISPATCH' },
      { type: 'DISPATCH', payload: null },
      { type: 'DISPATCH', payload: { type: 'JUMP_TO_STATE' } },
      { type: 'DISPATCH', payload: { type: 'JUMP_TO_ACTION' }, state: 2 },
      { type: 'DISPATCH', payload: { type: 'ROLLBACK' }, state: '{' },
    ]) {
      expect(() => commands[0](message)).toThrow();
      expect(store.getState()).toBe(0);
    }
    commands[0]({ type: 'START' });
    commands[0]({ type: 'DISPATCH', payload: { type: 'UNSUPPORTED' } });

    store.set(1);

    expect(sends).toEqual([{ action: 'boundary:anonymous action', state: 1 }]);
  });
});

test('devtools: dispose -> retained callbacks and later writes are inert for only that connection', () => {
  withExtension(({ commands, sends, inits, unsubscribed }) => {
    const first = devtools('first')(new Store(0));
    const second = devtools('second')(new Store(0));

    dispose(first);
    dispose(first);
    commands[0](jump('JUMP_TO_STATE', 4));
    commands[0]({ type: 'DISPATCH', payload: { type: 'RESET' } });
    commands[0](null);
    first.set(1);
    second.set(2);

    expect(first.getState()).toBe(1);
    expect(unsubscribed).toEqual([0]);
    expect(inits).toEqual([0, 0]);
    expect(sends).toEqual([{ action: 'second:anonymous action', state: 2 }]);
  });
});

test('devtools: custom state deserializer -> restores non-JSON state without reducer dispatch', () => {
  withExtension(({ commands, options, sends }) => {
    const serialize = { replacer: (_key: string, value: unknown) => value } satisfies DevtoolsSerializeOptions;
    const settings: DevtoolsOptions = {
      serialize,
      deserializeState: (text) => ({ date: new Date(JSON.parse(text).date) }),
      actionSanitizer: (action: DevtoolsAction) => action,
    };
    const store = pipe.use(devtools('date', settings)).create({ date: new Date(0) });

    commands[0](jump('JUMP_TO_STATE', { date: '2026-01-01T00:00:00.000Z' }));

    expect(store.getState().date).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(options).toEqual([{ name: 'date', serialize }]);
    expect(sends).toEqual([]);
  });
});

test('devtools: sanitizer failure -> committed state survives and a later send recovers', () => {
  const errors = spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    withExtension(({ sends }) => {
      let reject = true;
      const store = devtools('failure', {
        actionSanitizer(action) {
          if (reject) throw new Error('redaction failed');
          return action;
        },
      })(new Store(0));
      store.set(1);
      expect(store.getState()).toBe(1);
      expect(sends).toEqual([]);
      reject = false;

      store.set(2);

      expect(sends).toEqual([{ action: 'failure:anonymous action', state: 2 }]);
      expect(errors).toHaveBeenCalledTimes(1);
    });
  } finally {
    errors.mockRestore();
  }
});

test('devtools: validated jump with history and persistence -> resets baseline and saves only accepted state', async () => {
  await withBrowserFakes<{ count: number }, Promise<void>>(async (storage, connections) => {
    const rejected: unknown[] = [];
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: (value: unknown) =>
          typeof value === 'object' && value !== null && 'count' in value &&
          typeof value.count === 'number' && value.count >= 0
            ? { value: { count: Math.floor(value.count) } }
            : { issues: [{ message: 'Invalid count' }] },
      },
    };
    const store = pipe
      .use(devtools('composed'))
      .use(history())
      .use(validate(schema, { onError: (issues) => { rejected.push(issues); } }))
      .use(persist({
        key: 'composed',
        storage: jsonStorage(() => localStorage),
        decode: value => typeof value === 'object' && value !== null &&
          'count' in value && typeof value.count === 'number' ? { count: value.count } : null,
      }))
      .create({ count: 0 });
    await store.persist.rehydrate();
    store.set({ count: 1 });
    await store.persist.flush();
    const connection = connections[0];
    connection.sends.length = 0;

    connection.listener?.(jump('JUMP_TO_STATE', { count: -1 }));

    expect(store.getState()).toEqual({ count: 1 });
    expect(store.canUndo()).toBeTrue();
    expect(rejected).toHaveLength(1);
    connection.listener?.(jump('JUMP_TO_ACTION', { count: 3.9 }));
    await store.persist.flush();
    expect(store.getState()).toEqual({ count: 3 });
    expect(store.canUndo()).toBeFalse();
    expect(store.canRedo()).toBeFalse();
    expect(JSON.parse(storage.getItem('composed') ?? '')).toEqual({ state: { count: 3 }, version: 0 });
    expect(connection.sends).toEqual([]);
    store.set({ count: 5 });
    expect(connection.sends).toEqual([{ action: 'composed:anonymous action', state: { count: 5 } }]);
    dispose(store);
  });
});

test('devtools: nested jumps and a reentrant user edit -> suppresses replay without hiding the edit', () => {
  withExtension(({ commands, sends }) => {
    const store = devtools('nested')(new Store(0));
    let nested = false;
    store.subscribe(() => {
      if (nested) return;
      nested = true;
      commands[0](jump('JUMP_TO_ACTION', 2));
      store.set(3);
    });

    commands[0](jump('JUMP_TO_STATE', 1));

    expect(store.getState()).toBe(3);
    expect(sends).toEqual([{ action: 'nested:anonymous action', state: 3 }]);
  });
});

test('devtools: deferred update pipeline -> jump is immediate and does not echo at flush', () => {
  withExtension(({ commands, sends }) => {
    const pending: (() => void)[] = [];
    const defer = definePipeableMiddleware(
      <T>(store: Store<T>) => {
        store.pushMiddleware((state, next) => { pending.push(() => next(state)); });
        return store;
      },
      { id: '@test/defer-devtools' },
    );
    const store = devtools('deferred')(defer(new Store(0)));
    store.set(3);

    commands[0](jump('JUMP_TO_STATE', 2));

    expect(store.getState()).toBe(2);
    expect(sends).toEqual([]);
    expect(pending).toHaveLength(1);
    pending[0]();
    expect(store.getState()).toBe(3);
    expect(sends).toEqual([{ action: 'deferred:anonymous action', state: 3 }]);
  });
});

test('devtools: restoration and commit initialization -> sanitizes every outgoing state without changing baseline', async () => {
  await withBrowserFakes<{ count: number }, Promise<void>>(async (storage, connections) => {
    storage.setItem('restore', JSON.stringify({ state: { count: 8 }, version: 0 }));
    const store = pipe.use(devtools('restore', {
      stateSanitizer: () => ({ count: 99 }),
      actionSanitizer: () => 'redacted',
    })).use(persist({
      key: 'restore',
      storage: jsonStorage(() => localStorage),
      decode: value => typeof value === 'object' && value !== null &&
        'count' in value && typeof value.count === 'number' ? { count: value.count } : null,
    })).create({ count: 0 });

    await store.persist.rehydrate();

    const connection = connections[0];
    expect(store.getState()).toEqual({ count: 8 });
    expect(connection.inits).toEqual([{ count: 99 }]);
    expect(connection.sends).toEqual([{ action: 'redacted', state: { count: 99 } }]);
    connection.listener?.({ type: 'DISPATCH', payload: { type: 'COMMIT' } });
    expect(store.getState()).toEqual({ count: 8 });
    expect(connection.inits).toEqual([{ count: 99 }, { count: 99 }]);
    dispose(store);
  });
});

test('devtools: throwing jump notifications -> later ordinary writes are still observable', () => {
  withExtension(({ commands, sends }) => {
    const store = devtools('notification')(new Store(0));
    const unsubscribe = store.subscribe(() => { throw new Error('subscriber failed'); });

    expect(() => commands[0](jump('JUMP_TO_ACTION', 1))).toThrow(AggregateError);

    expect(store.getState()).toBe(1);
    unsubscribe();
    store.set(2);
    expect(sends).toEqual([{ action: 'notification:anonymous action', state: 2 }]);
  });
});

test('devtools: disposal inside a sanitizer -> no send occurs after cleanup', () => {
  withExtension(({ sends, unsubscribed }) => {
    const store = devtools('dispose-send', {
      actionSanitizer(action) {
        dispose(store);
        return action;
      },
    })(new Store(0));

    store.set(1);

    expect(store.getState()).toBe(1);
    expect(sends).toEqual([]);
    expect(unsubscribed).toEqual([0]);
  });
});

test('devtools: throwing payload accessor -> observer failure cannot reject the reducer commit', () => {
  const errors = spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    withExtension(({ sends }) => {
      const store = devtools('accessor')(new Store(0));
      const reducer = createReducer((state: number, _action: { type: string }) => state + 1, store);
      const action = {
        type: 'increment',
        get payload(): unknown { throw new Error('unreadable payload'); },
      };

      reducer.dispatch(action);

      expect(store.getState()).toBe(1);
      expect(sends).toEqual([]);
      expect(errors).toHaveBeenCalledTimes(1);
      reducer.dispatch({ type: 'increment' });
      expect(sends).toEqual([{ action: { type: 'accessor:increment' }, state: 2 }]);
    });
  } finally {
    errors.mockRestore();
  }
});

test('devtools: downstream middleware dispatches before next -> each commit retains its own action', () => {
  withExtension(({ sends }) => {
    const store = pipe.use(devtools('middleware')).create({ count: 0 });
    const reducer = createReducer(
      (state: { count: number }, action: { type: string; payload: number }) =>
        ({ count: state.count + action.payload }),
      store,
    );
    let nested = false;
    store.pushMiddleware((state, next) => {
      if (!nested) {
        nested = true;
        reducer.dispatch({ type: 'inner', payload: 10 });
      }
      next(state);
    });

    reducer.dispatch({ type: 'outer', payload: 1 });

    expect(sends).toEqual([
      { action: { type: 'middleware:inner', payload: 10 }, state: { count: 10 } },
      { action: { type: 'middleware:outer', payload: 1 }, state: { count: 1 } },
    ]);
  });
});
