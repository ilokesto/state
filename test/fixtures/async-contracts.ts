import { createEffect, createResource, createStore, listenActions } from '@ilokesto/state';
import type {
  ActionSource, EffectCallback, EffectCleanup, EffectContext, EffectOptions,
  ReadableStore, Resource, ResourceContext, ResourceResult, ResourceRunOptions,
  ResourceState, ResourceTask, SelectorEffectOptions, Unsubscribe,
} from '@ilokesto/state';

type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const task: ResourceTask<string, number> = async (input, context: ResourceContext) => {
  const signal: AbortSignal = context.signal;
  void signal;
  return input.length;
};
const resource = createResource(task);
const contract: Resource<string, number> = resource;
const readable: ReadableStore<ResourceState<number>> = resource.store;
const options: ResourceRunOptions = { signal: new AbortController().signal };
const promise: Promise<ResourceResult<number>> = resource.run('input', options);
const snapshot = readable.getState();
if (snapshot.status === 'success') {
  const data: number = snapshot.data;
  void data;
}
if (snapshot.status === 'error') {
  const error: unknown = snapshot.error;
  void error;
}
promise.then(result => {
  if (result.status === 'success') {
    const data: number = result.data;
    void data;
  } else if (result.status === 'cancelled') {
    const reason: unknown = result.reason;
    void reason;
  } else {
    const error: unknown = result.error;
    void error;
  }
});
const noInput: Promise<ResourceResult<number>> = createResource(() => 1).run();
const asyncInferred = createResource(async (input: string) => input.length);
type InferredResult = Assert<Equal<ReturnType<typeof asyncInferred.run>, Promise<ResourceResult<number>>>>;
type RequiredInput = Assert<Equal<Parameters<typeof resource.run>[0], string>>;
type NoStoreWrite = Assert<Equal<'setState' extends keyof typeof readable ? true : false, false>>;
type Statuses = Assert<Equal<ResourceState<number>['status'], 'idle' | 'pending' | 'success' | 'error'>>;

const store = createStore({ count: 0 });
const effectOptions: EffectOptions = { onError: (_error: unknown) => undefined };
const selectorOptions: SelectorEffectOptions<number> = {
  ...effectOptions,
  equalityFn: (left, right) => left === right,
  fireImmediately: false,
};
const effect: EffectCallback<number> = async (count, context: EffectContext) => {
  const signal: AbortSignal = context.signal;
  const stop: Unsubscribe = context.dispose;
  const cleanup: EffectCleanup = () => { void count; void signal; void stop; };
  return cleanup;
};
const stopEffect: Unsubscribe = createEffect(store, state => state.count, effect, selectorOptions);
type Action = { readonly type: 'saved'; readonly id: string } | { readonly type: 'reset' };
const source: ActionSource<Action> = { subscribe: _listener => () => undefined };
const stopActions: Unsubscribe = listenActions(source, (action, { signal }) => {
  if (action.type === 'saved') {
    const id: string = action.id;
    void id;
  }
  void signal;
}, effectOptions);
void contract; void noInput; void stopEffect; void stopActions;
export type AsyncTypeContracts = InferredResult | RequiredInput | NoStoreWrite | Statuses;
