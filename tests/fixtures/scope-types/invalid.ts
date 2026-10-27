import { createScope, createStateFactory, createStore } from '../../../dist/index';
import type { ReadableStore } from '../../../dist/index';

const scope = createScope();
const readonly: ReadableStore<{ count: number }> = createStore({ count: 1 });
scope.create(() => readonly);
scope.borrow(readonly).set({ count: 2 });
createStateFactory({});
const factory = createStateFactory({
  decode: (_input: unknown) => ({ count: 1 }),
});
factory.hydrate({});
factory.create(null).set({ count: 'invalid' });
createStateFactory({
  decode: (_input: unknown) => ({ count: 1 }),
  create: (_state: { label: string }) => createStore({ label: 'wrong' }),
});
