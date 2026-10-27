import { createStore } from '@ilokesto/state';
import { memoryStorage } from '@ilokesto/state/middleware';
import type { PersistStorageFactory } from '@ilokesto/state/middleware';
import { createStoreTestHarness, memoryStorage as utilityMemoryStorage } from '@ilokesto/state/utils';
import type { StoreTestHarness, StoreWaitOptions } from '@ilokesto/state/utils';

type Expect<Condition extends true> = Condition;
type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends (<T>() => T extends Right ? 1 : 2) ? true : false;

const store = createStore({ count: 0 });
const harness = createStoreTestHarness(store);
const factory: PersistStorageFactory = memoryStorage([['counter', { state: 2, version: 0 }]]);
const utilityFactory: typeof memoryStorage = utilityMemoryStorage;
const options: StoreWaitOptions = { timeoutMs: 1000, signal: new AbortController().signal };
const waiting = harness.waitFor(state => state.count > 0, options);

export type InferredHarness = Expect<Equal<typeof harness, StoreTestHarness<{ count: number }>>>;
export type InferredWait = Expect<Equal<typeof waiting, Promise<Readonly<{ count: number }>>>>;
export type ReadonlyStates = Expect<
  Equal<typeof harness.states, ReadonlyArray<Readonly<{ count: number }>>>
>;
export type InvalidTimeout = Expect<Equal<
  { timeoutMs: string } extends StoreWaitOptions ? true : false,
  false
>>;
export type FactoryContract = Expect<Equal<typeof factory, ReturnType<typeof utilityFactory>>>;
