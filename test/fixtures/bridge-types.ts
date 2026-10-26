import {
  createActorBridge, createQueryBridge, createUrlBridge,
  type ActorBridge, type SnapshotBridge, type UrlBridge, type UrlEnvironment,
} from '@ilokesto/state';
import {
  createActorBridge as actorFromUtils,
  createQueryBridge as queryFromUtils,
  createUrlBridge as urlFromUtils,
} from '@ilokesto/state/utils';
import { QueryClient, QueryObserver, type QueryObserverResult } from '@tanstack/query-core';
import { createActor, fromTransition } from 'xstate';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

const observer = new QueryObserver(new QueryClient(), {
  queryKey: ['count'],
  queryFn: async () => ({ count: 1 }),
});
const query = createQueryBridge(observer);
const queryContract: SnapshotBridge<QueryObserverResult<{ count: number }, Error>> = query;
const sameQuery: typeof createQueryBridge = queryFromUtils;

type Event = { type: 'add'; amount: number } | { type: 'reset' };
const actor = createActor(fromTransition(
  (count: number, event: Event) => event.type === 'reset' ? 0 : count + event.amount,
  0,
));
const bridge = createActorBridge(actor);
const actorContract: ActorBridge<ReturnType<typeof actor.getSnapshot>, Event> = bridge;
const sameActor: typeof createActorBridge = actorFromUtils;
export type ExactEvents = Assert<Equal<Parameters<typeof bridge.send>[0], Event>>;
export type ExactSnapshot = Assert<Equal<ReturnType<typeof bridge.store.getState>, Readonly<ReturnType<typeof actor.getSnapshot>>>>;
export type NoSnapshotWrites = Assert<Equal<Extract<keyof typeof bridge.store, 'set' | 'setState' | 'update'>, never>>;
export type WrongEventRejected = Assert<Equal<{ type: 'unknown' } extends Parameters<typeof bridge.send>[0] ? true : false, false>>;

const url = createUrlBridge({
  key: 'count',
  defaultValue: 0,
  codec: { parse: (value) => Number(value), serialize: (value: number) => String(value) },
});
const urlContract: UrlBridge<number> = url;
const sameUrl: typeof createUrlBridge = urlFromUtils;
const browserEnvironment: UrlEnvironment = window;
export type ExactUrlValue = Assert<Equal<Parameters<typeof url.set>[0], number>>;
export type ExactHistoryMode = Assert<Equal<Parameters<typeof url.set>[1], 'push' | 'replace' | undefined>>;
export type NoQueryWrites = Assert<Equal<Extract<keyof typeof query.store, 'set' | 'setState' | 'update'>, never>>;
void [queryContract, sameQuery, actorContract, sameActor, urlContract, sameUrl, browserEnvironment];
