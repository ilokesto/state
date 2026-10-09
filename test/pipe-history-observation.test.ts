import { jsonStorage } from '../src/middleware';
import { expect, spyOn, test } from 'bun:test';

import { withBrowserFakes } from './helpers/browserFakes';
import { devtools, history, logger, persist, validate } from '../src/middleware';
import { pipe } from '../src/utils/pipe';

type CounterState = {
  readonly count: number;
};

const decodeCounter = (value: unknown): CounterState | null => {
  if (typeof value !== 'object' || value === null || !('count' in value)) return null;
  if (typeof value.count !== 'number') return null;
  return { count: value.count };
};

test('Given validate, history, persist, logger, and DevTools, when accepted and rejected updates plus undo and redo run, then only committed states are observed across the chain', async () => {
  // Given
  await withBrowserFakes<CounterState, Promise<void>>(async (storage, connections) => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => undefined);
    const groupSpy = spyOn(console, 'group').mockImplementation(() => undefined);
    const groupEndSpy = spyOn(console, 'groupEnd').mockImplementation(() => undefined);
    const logSpy = spyOn(console, 'log').mockImplementation(() => undefined);
    const schema = {
      '~standard': {
        validate: (value: unknown) =>
          typeof value === 'object' &&
          value !== null &&
          'count' in value &&
          typeof value.count === 'number' &&
          value.count >= 0
            ? { value: { count: value.count } }
            : { issues: [{ message: 'count must be non-negative' }] },
        vendor: 'test',
        version: 1 as const,
      },
    } as const;

    try {
      const store = pipe
        .use(validate(schema))
        .use(history())
        .use(persist({ decode: decodeCounter, key: 'history-observations', storage: jsonStorage(() => localStorage) }))
        .use(logger({ timestamp: false }))
        .use(devtools('history-observations'))
        .create<CounterState>({ count: 0 });
    await store.persist.rehydrate();
    await store.persist.flush();

      // When
      store.setState({ count: 1 });
    await store.persist.flush();
      store.setState({ count: -1 });
    await store.persist.flush();
      store.undo();
    await store.persist.flush();
      store.redo();
    await store.persist.flush();

      // Then
      expect(store.getState()).toEqual({ count: 1 });
      expect(store.canUndo()).toBeTrue();
      expect(store.canRedo()).toBeFalse();
      expect(JSON.parse(storage.getItem('history-observations') ?? '')).toEqual({
        state: { count: 1 },
        version: 0,
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(groupSpy).toHaveBeenCalledTimes(3);
      expect(groupEndSpy).toHaveBeenCalledTimes(3);
      expect(logSpy).toHaveBeenCalledTimes(6);
      expect(connections).toHaveLength(1);
      expect(connections[0]?.sends).toEqual([
        { action: 'history-observations:anonymous action', state: { count: 1 } },
        { action: 'history-observations:anonymous action', state: { count: 0 } },
        { action: 'history-observations:anonymous action', state: { count: 1 } },
      ]);
      expect(storage.writes).toBe(3);
    } finally {
      errorSpy.mockRestore();
      groupSpy.mockRestore();
      groupEndSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
