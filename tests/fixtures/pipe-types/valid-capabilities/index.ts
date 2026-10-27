import { definePipeableMiddleware } from '../../../../src/utils/pipe/metadata';
import type { Pipe, PipeAnyMiddleware, PipeCapability, PipeMiddleware } from '../../../../src/utils/pipe/types';

type CounterState = {
  readonly count: number;
};

type ApiCapability = PipeCapability<'@fixture/api', { readonly api: () => number }>;

declare const root: Pipe;
declare const apiProvider: PipeAnyMiddleware<readonly [], readonly [ApiCapability]>;
declare const apiConsumer: PipeAnyMiddleware<readonly [ApiCapability]>;
declare const stateEstablisher: PipeMiddleware<CounterState & { readonly label: string }>;
declare const compatibleStateMiddleware: PipeMiddleware<CounterState>;

const provider = definePipeableMiddleware(apiProvider, {
  adds: [{ id: '@fixture/api', shape: { api: () => 42 } }],
  id: '@fixture/provider',
} as const);
const consumer = definePipeableMiddleware(apiConsumer, {
  id: '@fixture/consumer',
  requires: [{ id: '@fixture/api', shape: { api: () => 0 } }],
} as const);
const stateSpecific = definePipeableMiddleware(stateEstablisher, { id: '@fixture/state-establisher' } as const);
const compatibleStateSpecific = definePipeableMiddleware(
  compatibleStateMiddleware,
  { id: '@fixture/compatible-state' } as const,
);

const store = root.use(provider).use(consumer).create({ count: 0 });
const stateSpecificStore = root
  .use(stateSpecific)
  .use(compatibleStateSpecific)
  .create({ count: 0, label: 'stable' });

store.api();
stateSpecificStore.getState().label;
