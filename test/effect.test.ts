import { expect, test } from 'bun:test';
import { createEffect, createReducer, createResource, createStore, listenActions } from '@ilokesto/state';
import type { ActionSource, EffectCleanup } from '@ilokesto/state';

function actionSource<Action>() {
  const listeners = new Set<(action: Action) => void>();
  return {
    subscribe(listener: (action: Action) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    emit(action: Action) {
      for (const listener of [...listeners]) {
        listener(action);
      }
    },
    size: () => listeners.size,
  };
}

test('createEffect: selected changes -> aborts and cleans previous run before next callback', () => {
  const store = createStore({ count: 0, label: 'before' });
  const events: string[] = [];
  const errors: unknown[] = [];
  const signals: AbortSignal[] = [];
  const stop = createEffect(store, state => state.count, (count, { signal }) => {
    events.push(`run:${count}`);
    signals.push(signal);
    return () => events.push(`cleanup:${count}:${signal.aborted}`);
  }, { onError: error => errors.push(error) });

  store.set({ count: 0, label: 'after' });
  store.set({ count: 1, label: 'after' });
  stop();
  stop();
  store.set({ count: 2, label: 'after' });

  expect(events).toEqual(['run:0', 'cleanup:0:true', 'run:1', 'cleanup:1:true']);
  expect(signals.every(signal => signal.aborted)).toBe(true);
  expect(errors).toEqual([]);
});

test('createEffect: custom equality and deferred initial run -> invokes only distinct selections', () => {
  const store = createStore({ count: 0 });
  const values: number[] = [];
  const stop = createEffect(store, state => ({ count: state.count }), selected => {
    values.push(selected.count);
  }, {
    onError: error => { throw error; },
    fireImmediately: false,
    equalityFn: (left, right) => left.count === right.count,
  });

  store.set({ count: 0 });
  store.set({ count: 1 });
  stop();

  expect(values).toEqual([1]);
});

test('listenActions: reentrant action -> serializes callback and cleanup before nested run', () => {
  const source = actionSource<number>();
  const events: string[] = [];
  const stop = listenActions(source, action => {
    events.push(`start:${action}`);
    if (action === 1) {
      source.emit(2);
    }
    events.push(`end:${action}`);
    return () => events.push(`cleanup:${action}`);
  }, { onError: error => { throw error; } });

  source.emit(1);
  stop();

  expect(events).toEqual(['start:1', 'end:1', 'cleanup:1', 'start:2', 'end:2', 'cleanup:2']);
  expect(source.size()).toBe(0);
});

test('listenActions: cleanup emits an action -> completes cleanup before FIFO callbacks', () => {
  const source = actionSource<number>();
  const events: string[] = [];
  const stop = listenActions(source, action => {
    events.push(`run:${action}`);
    return () => {
      events.push(`cleanup-start:${action}`);
      if (action === 1) {
        source.emit(3);
      }
      events.push(`cleanup-end:${action}`);
    };
  }, { onError: error => { throw error; } });
  source.emit(1);

  source.emit(2);
  stop();

  expect(events).toEqual([
    'run:1', 'cleanup-start:1', 'cleanup-end:1',
    'run:2', 'cleanup-start:2', 'cleanup-end:2',
    'run:3', 'cleanup-start:3', 'cleanup-end:3',
  ]);
});

test('createEffect: initial callback disposes itself -> unsubscribes and cleans returned resource once', () => {
  const store = createStore(0);
  const events: string[] = [];
  const stop = createEffect(store, state => state, (_, { dispose, signal }) => {
    events.push('run');
    dispose();
    expect(signal.aborted).toBe(true);
    return () => { events.push('cleanup'); };
  }, { onError: error => { throw error; } });

  store.set(1);
  stop();

  expect(events).toEqual(['run', 'cleanup']);
});

test('listenActions: cleanup disposes listener -> queued replacement never runs', () => {
  const source = actionSource<number>();
  const events: number[] = [];
  const stop = listenActions(source, (action, { dispose }) => {
    events.push(action);
    return dispose;
  }, { onError: error => { throw error; } });
  source.emit(1);

  source.emit(2);
  stop();

  expect(events).toEqual([1]);
  expect(source.size()).toBe(0);
});

test('listenActions: callback and cleanup throw -> reports errors while keeping future actions live', () => {
  const source = actionSource<number>();
  const errors: unknown[] = [];
  const callbackFailure = new Error('callback');
  const cleanupFailure = new Error('cleanup');
  const events: number[] = [];
  const stop = listenActions(source, action => {
    events.push(action);
    if (action === 1) {
      throw callbackFailure;
    }
    return () => { throw cleanupFailure; };
  }, { onError: error => errors.push(error) });

  source.emit(1);
  source.emit(2);
  source.emit(3);
  stop();

  expect(events).toEqual([1, 2, 3]);
  expect(errors).toEqual([callbackFailure, cleanupFailure, cleanupFailure]);
  expect(source.size()).toBe(0);
});

for (const operation of ['replace', 'dispose'] as const) {
  test(`listenActions: async cleanup resolves after ${operation} -> releases obsolete resource exactly once`, async () => {
    const source = actionSource<number>();
    const deferred = Promise.withResolvers<void | EffectCleanup>();
    const events: string[] = [];
    const signals: AbortSignal[] = [];
    const stop = listenActions(source, (action, { signal }) => {
      signals.push(signal);
      if (action === 1) {
        return deferred.promise;
      }
      return () => events.push('current cleanup');
    }, { onError: error => { throw error; } });
    source.emit(1);
    if (operation === 'replace') {
      source.emit(2);
    } else {
      stop();
    }

    deferred.resolve(() => { events.push('late cleanup'); });
    await deferred.promise;
    stop();
    stop();

    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(events).toEqual(operation === 'replace' ? ['late cleanup', 'current cleanup'] : ['late cleanup']);
    expect(source.size()).toBe(0);
  });
}

test('listenActions: async cleanup resolves while current -> retains it until next action', async () => {
  const source = actionSource<number>();
  const deferred = Promise.withResolvers<void | EffectCleanup>();
  const events: string[] = [];
  const stop = listenActions(source, action => {
    if (action === 1) {
      return deferred.promise;
    }
    events.push(`run:${action}`);
  }, { onError: error => { throw error; } });
  source.emit(1);
  deferred.resolve(() => { events.push('cleanup'); });
  await deferred.promise;
  expect(events).toEqual([]);

  source.emit(2);
  stop();

  expect(events).toEqual(['cleanup', 'run:2']);
});

test('listenActions: async effect rejects after disposal -> reports once without unhandled rejection', async () => {
  const source = actionSource<number>();
  const deferred = Promise.withResolvers<void>();
  const reported = Promise.withResolvers<unknown>();
  const errors: unknown[] = [];
  const stop = listenActions(source, () => deferred.promise, {
    onError: error => {
      errors.push(error);
      reported.resolve(error);
    },
  });
  source.emit(1);
  stop();
  const failure = new Error('late rejection');

  deferred.reject(failure);

  expect(await reported.promise).toBe(failure);
  expect(errors).toEqual([failure]);
  expect(source.size()).toBe(0);
});

test('listenActions: late cleanup emits action -> waits for that cleanup to return', async () => {
  const source = actionSource<number>();
  const deferred = Promise.withResolvers<void | EffectCleanup>();
  const events: string[] = [];
  const stop = listenActions(source, action => {
    if (action === 1) {
      return deferred.promise;
    }
    events.push(`run:${action}`);
  }, { onError: error => { throw error; } });
  source.emit(1);
  source.emit(2);

  deferred.resolve(() => {
    events.push('cleanup:start');
    source.emit(3);
    events.push('cleanup:end');
  });
  await deferred.promise;
  stop();

  expect(events).toEqual(['run:2', 'cleanup:start', 'cleanup:end', 'run:3']);
});

test('listenActions: subscription emits synchronously -> disposer is registered before callback runs', () => {
  let subscriptions = 0;
  const source: ActionSource<number> = {
    subscribe(listener) {
      subscriptions += 1;
      listener(1);
      listener(2);
      return () => { subscriptions -= 1; };
    },
  };
  const events: number[] = [];

  const stop = listenActions(source, (action, { dispose }) => {
    events.push(action);
    dispose();
  }, { onError: error => { throw error; } });
  stop();

  expect(events).toEqual([1]);
  expect(subscriptions).toBe(0);
});

test('listenActions: source unsubscribe throws -> still aborts and cleans up', () => {
  const source = actionSource<number>();
  const failure = new Error('unsubscribe');
  const errors: unknown[] = [];
  let cleaned = false;
  let signal: AbortSignal | undefined;
  const stop = listenActions({
    subscribe(listener: (action: number) => void) {
      const unsubscribe = source.subscribe(listener);
      return () => {
        unsubscribe();
        throw failure;
      };
    },
  }, (_, context) => {
    signal = context.signal;
    return () => { cleaned = true; };
  }, { onError: error => errors.push(error) });
  source.emit(1);

  stop();
  stop();

  expect(cleaned).toBe(true);
  expect(signal?.aborted).toBe(true);
  expect(errors).toEqual([failure]);
  expect(source.size()).toBe(0);
});

test('createEffect: synchronous reducer dispatch -> observes selection without changing dispatch return', () => {
  const counter = createReducer((state: number, action: { type: 'add'; amount: number }) => state + action.amount, 0);
  const selected: number[] = [];
  const stop = createEffect(counter.store, state => state, value => {
    selected.push(value);
  }, { onError: error => { throw error; } });

  const returned = counter.dispatch({ type: 'add', amount: 2 });
  stop();

  expect(returned).toBeUndefined();
  expect(counter.store.getState()).toBe(2);
  expect(selected).toEqual([0, 2]);
});

test('createEffect: resource store -> observes pending and result without writable store access', async () => {
  const resource = createResource((input: number) => input * 2);
  const statuses: string[] = [];
  const stop = createEffect(resource.store, state => state.status, status => {
    statuses.push(status);
  }, { onError: error => { throw error; } });

  await resource.run(3);
  stop();

  expect(statuses).toEqual(['idle', 'pending', 'success']);
});

test('listenActions: void cleanup returns a rejected promise -> reports rather than leaking a rejection', async () => {
  const source = actionSource<number>();
  const reported = Promise.withResolvers<unknown>();
  const failure = new Error('async cleanup');
  const stop = listenActions(source, () => async () => {
    throw failure;
  }, { onError: error => reported.resolve(error) });
  source.emit(1);

  stop();

  expect(await reported.promise).toBe(failure);
  expect(source.size()).toBe(0);
});

test('createEffect: initial callback writes state -> cleans initial resource before rerun', () => {
  const store = createStore(0);
  const events: string[] = [];
  const stop = createEffect(store, state => state, value => {
    events.push(`start:${value}`);
    if (value === 0) {
      store.set(1);
    }
    events.push(`end:${value}`);
    return () => { events.push(`cleanup:${value}`); };
  }, { onError: error => { throw error; } });

  stop();

  expect(events).toEqual(['start:0', 'end:0', 'cleanup:0', 'start:1', 'end:1', 'cleanup:1']);
});

test('listenActions: late cleanup throws and reporter emits -> finishes reporter before next callback', async () => {
  const source = actionSource<number>();
  const deferred = Promise.withResolvers<void | EffectCleanup>();
  const events: string[] = [];
  const failure = new Error('late cleanup');
  const stop = listenActions(source, action => {
    if (action === 1) {
      return deferred.promise;
    }
    events.push(`run:${action}`);
  }, {
    onError: error => {
      expect(error).toBe(failure);
      events.push('report:start');
      source.emit(3);
      events.push('report:end');
    },
  });
  source.emit(1);
  source.emit(2);

  deferred.resolve(() => { throw failure; });
  await deferred.promise;
  stop();

  expect(events).toEqual(['run:2', 'report:start', 'report:end', 'run:3']);
});
