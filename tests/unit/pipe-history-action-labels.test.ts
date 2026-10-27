import { expect, test } from 'bun:test';
import { devtools, dispose, history } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';
import { withBrowserFakes } from '../fixtures/helpers/browserFakes';

for (const direction of ['undo', 'redo'] as const) {
  test(`history ${direction}: DevTools observes replay -> identifies the history action`, () => {
    withBrowserFakes<{ count: number }>((_storage, connections) => {
      const store = pipe.use(devtools('editor')).use(history()).create({ count: 0 });
      store.set({ count: 1 });
      if (direction === 'redo') {
        store.undo();
      }
      const connection = connections[0];
      connection.sends.length = 0;

      store[direction]();

      expect(connection.sends).toEqual([{
        action: `editor:history/${direction}`,
        state: { count: direction === 'undo' ? 0 : 1 },
      }]);
      dispose(store);
    });
  });
}
