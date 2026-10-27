import { Store } from '@ilokesto/store';

import { definePipeableMiddleware } from '../../../../src/utils/pipe/metadata';
import { pipe } from '../../../../src/utils/pipe';
import type { PipeAnyMiddleware, PipeCapability } from '../../../../src/utils/pipe/types';

type CounterState = {
  readonly count: number;
};

type ApiCapability = PipeCapability<'@fixture/api', { readonly api: () => number }>;

const provider: PipeAnyMiddleware<readonly [], readonly [ApiCapability]> = <State>(store: Store<State>) => {
  return Object.assign(store, { api: () => 42 });
};

const taggedProvider = definePipeableMiddleware(provider, {
  adds: [{ id: '@fixture/api', shape: { api: () => 42 } }],
  id: '@fixture/provider',
} as const);

const builder = pipe.use(taggedProvider);
const store = builder.create<CounterState>({ count: 0 });

store.api();
store.getState().count;
