import { definePipeableMiddleware } from '../../../../src/utils/pipe/metadata';
import type { Pipe, PipeAnyMiddleware, PipeCapability } from '../../../../src/utils/pipe/types';

type ApiCapability = PipeCapability<'@fixture/api', { readonly api: () => number }>;

declare const root: Pipe;
declare const apiConsumer: PipeAnyMiddleware<readonly [ApiCapability]>;

const consumer = definePipeableMiddleware(apiConsumer, {
  id: '@fixture/consumer',
  requires: [{ id: '@fixture/api', shape: { api: () => 0 } }],
} as const);

const rejectedRequirement = root.use(consumer);

rejectedRequirement;
