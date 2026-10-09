import assert from 'node:assert/strict';
import { dispose, PersistError, persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

// Shared data is separate from each adapter instance's owned resources.
const records = new Map();
let instancesCreated = 0;
let instancesDisposed = 0;
const storage = () => {
  instancesCreated += 1;
  let disposed = false;
  const requireActive = () => {
    if (disposed) throw new Error('Storage instance is disposed');
  };
  return {
    async getItem(key) {
      requireActive();
      return structuredClone(records.get(key) ?? null);
    },
    async setItem(key, value) {
      requireActive();
      records.set(key, structuredClone(value));
    },
    async removeItem(key) {
      requireActive();
      records.delete(key);
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        instancesDisposed += 1;
      }
    },
  };
};

const decodeCounter = value => {
  if (typeof value !== 'object' || value === null || !('count' in value)) return null;
  return typeof value.count === 'number' ? { count: value.count } : null;
};
const createCounter = () => pipe
  .use(persist({ key: 'counter', storage, decode: decodeCounter }))
  .create({ count: 0 });

const first = createCounter();
assert.equal(instancesCreated, 0);
await first.persist.rehydrate();
first.setState({ count: 3 });
await first.persist.flush();
assert.deepEqual(records.get('counter'), { state: { count: 3 }, version: 0 });

const second = createCounter();
await second.persist.rehydrate();
assert.equal(second.getState().count, 3);
dispose(first);
second.setState({ count: 4 });
await second.persist.flush();
assert.equal(records.get('counter').state.count, 4);
dispose(second);

const keepCurrent = createCounter();
keepCurrent.setState({ count: 7 });
await assert.rejects(keepCurrent.persist.rehydrate(), error =>
  error instanceof PersistError && error.code === 'CONFLICT');
assert.equal(keepCurrent.getState().count, 7);
assert.equal(records.get('counter').state.count, 4);
await keepCurrent.persist.rehydrate({ conflict: 'keep-current' });
await keepCurrent.persist.flush();
assert.equal(records.get('counter').state.count, 7);
dispose(keepCurrent);

const useStored = createCounter();
useStored.setState({ count: 9 });
await useStored.persist.rehydrate({ conflict: 'use-stored' });
assert.equal(useStored.getState().count, 7);
await useStored.persist.clearStorage();
assert.equal(records.has('counter'), false);
assert.equal(useStored.getState().count, 7);
dispose(useStored);
assert.equal(instancesDisposed, instancesCreated);
process.stdout.write('Restored, saved, resolved both conflicts, cleared storage, and disposed all instances.\n');
