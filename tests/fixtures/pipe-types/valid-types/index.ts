import { definePipeableMiddleware } from '../../../../src/utils/pipe/metadata';
import type {
  Pipe,
  PipeAnyMiddleware,
  PipeBuilder,
  PipeCapability,
  PipeMiddlewareChainValidation,
  PipeMiddleware,
  PipeMiddlewareMetadata,
} from '../../../../src/utils/pipe/types';

type CounterState = {
  readonly count: number;
};

type ClockCapability = PipeCapability<'clock', { readonly now: () => number }>;
type LogCapability = PipeCapability<'log', { readonly log: (message: string) => void }>;

declare const stateAgnosticMiddleware: PipeAnyMiddleware<readonly [], readonly [LogCapability]>;
declare const stateSpecificMiddleware: PipeMiddleware<CounterState>;
declare const root: Pipe;
declare const builder: PipeBuilder<CounterState, readonly [ClockCapability]>;

const metadata = {
  adds: [{ id: 'log', shape: { log: (message: string) => console.log(message) } }],
  after: ['outer'],
  before: ['inner'],
  conflicts: [],
  duplicate: 'allow',
  id: 'fixture',
  requires: [{ id: 'clock', shape: { now: () => Date.now() } }],
} satisfies PipeMiddlewareMetadata<
  'fixture',
  readonly [ClockCapability],
  readonly [LogCapability],
  'allow',
  readonly []
>;

const taggedStateSpecificMiddleware = definePipeableMiddleware(stateSpecificMiddleware, {
  id: '@fixture/state-specific',
} as const);
const taggedStateAgnosticMiddleware = definePipeableMiddleware(stateAgnosticMiddleware, {
  adds: [{ id: 'log', shape: { log: (message: string) => console.log(message) } }],
  id: '@fixture/state-agnostic',
} as const);

const stateSpecificBuilder = root.use(taggedStateSpecificMiddleware);
const genericBuilder = root.use(taggedStateAgnosticMiddleware);
const clockStore = builder.create({ count: 0 });

clockStore.now();
stateSpecificBuilder.create({ count: 0 });
genericBuilder.create({ count: 0 });
metadata.id;

type TwelveEntryValidChain = readonly [
  { readonly before: readonly ['@fixture/02']; readonly id: '@fixture/01' },
  { readonly before: readonly ['@fixture/03']; readonly id: '@fixture/02' },
  { readonly before: readonly ['@fixture/04']; readonly id: '@fixture/03' },
  { readonly before: readonly ['@fixture/05']; readonly id: '@fixture/04' },
  { readonly before: readonly ['@fixture/06']; readonly id: '@fixture/05' },
  { readonly before: readonly ['@fixture/07']; readonly id: '@fixture/06' },
  { readonly before: readonly ['@fixture/08']; readonly id: '@fixture/07' },
  { readonly before: readonly ['@fixture/09']; readonly id: '@fixture/08' },
  { readonly before: readonly ['@fixture/10']; readonly id: '@fixture/09' },
  { readonly before: readonly ['@fixture/11']; readonly id: '@fixture/10' },
  { readonly before: readonly ['@fixture/12']; readonly id: '@fixture/11' },
  { readonly id: '@fixture/12' },
];

const twelveEntryValidation: PipeMiddlewareChainValidation<TwelveEntryValidChain> = true;

twelveEntryValidation;
