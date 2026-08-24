import { Store } from '@ilokesto/store';

import { definePipeableMiddleware } from '../../../../src/utils/pipe/metadata';
import type {
  PipeAnyMiddleware,
  PipeCapability,
  PipeMiddleware,
  PipeMiddlewareMetadata,
} from '../../../../src/utils/pipe/types';
import type { PipeableMiddleware } from '../../../../src/utils/pipe/metadata';

type CounterState = {
  readonly count: number;
};

type ClockCapability = PipeCapability<'@fixture/clock', { readonly now: () => number }>;

const requires = [{ id: '@fixture/clock', shape: { now: () => 1 } }] as const satisfies readonly [ClockCapability];
const noCapabilities = [] as const;

const stateAgnostic = definePipeableMiddleware(
  <State>(store: Store<State>): Store<State> => store,
  {
    after: ['@fixture/outer'],
    adds: noCapabilities,
    before: ['@fixture/inner'],
    conflicts: [],
    duplicate: 'reject',
    id: '@fixture/generic',
    requires,
  },
);

const stateSpecific = definePipeableMiddleware(
  (store: Store<CounterState>): Store<CounterState> => store,
  {
    adds: noCapabilities,
    conflicts: [],
    duplicate: 'reject',
    id: '@fixture/specific',
    requires: noCapabilities,
  },
);

const explicitAfter = definePipeableMiddleware<'@fixture/explicit-after'>(
  <State>(store: Store<State>): Store<State> => store,
  { after: ['@fixture/dependency'], id: '@fixture/explicit-after' } as const,
);
const explicitBefore = definePipeableMiddleware<'@fixture/explicit-before'>(
  <State>(store: Store<State>): Store<State> => store,
  { before: ['@fixture/dependency'], id: '@fixture/explicit-before' } as const,
);

declare const clockStore: Store<{ readonly label: string }> & ClockCapability['shape'];

const genericStore = stateAgnostic(clockStore);
const counterStore = stateSpecific(new Store<CounterState>({ count: 0 }));

genericStore.getState().label;
counterStore.getState().count;
explicitAfter;
explicitBefore;

const genericLiteralContract: PipeableMiddleware<
  PipeAnyMiddleware<typeof requires, typeof noCapabilities>,
  PipeMiddlewareMetadata<
    '@fixture/generic',
    typeof requires,
    typeof noCapabilities,
    'reject',
    readonly []
  >
> = stateAgnostic;
const specificLiteralContract: PipeableMiddleware<
  PipeMiddleware<CounterState, typeof noCapabilities, typeof noCapabilities>,
  PipeMiddlewareMetadata<
    '@fixture/specific',
    typeof noCapabilities,
    typeof noCapabilities,
    'reject',
    readonly []
  >
> = stateSpecific;

genericLiteralContract;
specificLiteralContract;
