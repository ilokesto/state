import { createScope, createStateFactory, createStore } from '../../../dist/index';
import type { ReadableStore, StateFactory, StateScope, Store } from '../../../dist/index';
import { bindReadonly as react } from '../../../dist/core/React';
import { bindReadonly as vue } from '../../../dist/core/Vue';
import { bindReadonly as angular } from '../../../dist/core/Angular';
import { bindReadonly as solid } from '../../../dist/core/Solid';
import { bindReadonly as svelte } from '../../../dist/core/Svelte';
import { history } from '../../../dist/middleware';
import { pipe } from '../../../dist/utils';

type Counter = { count: number };
function decode(input: unknown): Counter {
  if (typeof input !== 'object' || input === null || !('count' in input) || typeof input.count !== 'number') {
    throw new TypeError('Invalid counter');
  }
  return { count: input.count };
}
const scope: StateScope = createScope();
const factory: StateFactory<Counter, Store<Counter>> = createStateFactory({ decode });
const plain: Store<Counter> = scope.create(() => factory.create({ count: 1 }));
plain.set({ count: 2 });
const enhanced = createStateFactory({
  decode,
  create: initial => pipe.use(history()).create(initial),
});
const owned = scope.create(() => enhanced.hydrate(enhanced.serialize(plain)));
owned.undo();
owned.redo();
const readable: ReadableStore<Counter> = plain;
const borrowed: ReadableStore<Counter> = scope.borrow(readable);
react(borrowed);
vue(borrowed);
angular(borrowed);
solid(borrowed);
svelte(borrowed);
const callable = scope.create(() => createStore((name: string) => name.length));
callable.set((name: string) => name.length + 1);
const nullable = scope.borrow(createStore<{ value: number } | null>(null));
const nullableValue: Readonly<{ value: number }> | null = nullable.getState();
const optional = scope.borrow(createStore<string | undefined>(undefined));
const optionalValue: string | undefined = optional.getState();
void [nullableValue, optionalValue];
scope.dispose();
