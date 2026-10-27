import { definePipeableMiddleware } from '../../../../src/utils/pipe/metadata';
import type { Pipe, PipeAnyMiddleware, PipeCapability } from '../../../../src/utils/pipe/types';

type ApiCapability = PipeCapability<'@fixture/api', { readonly api: () => number }>;

declare const root: Pipe;
declare const apiProvider: PipeAnyMiddleware<readonly [], readonly [ApiCapability]>;

const first = definePipeableMiddleware(apiProvider, {
  adds: [{ id: '@fixture/api', shape: { api: () => 1 } }],
  id: '@fixture/provider-one',
} as const);

const second = definePipeableMiddleware(apiProvider, {
  adds: [{ id: '@fixture/api', shape: { api: () => 2 } }],
  id: '@fixture/provider-two',
} as const);

const rejectedDuplicateCapability = root.use(first).use(second);

rejectedDuplicateCapability;
