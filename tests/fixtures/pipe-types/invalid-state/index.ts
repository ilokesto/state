import { definePipeableMiddleware } from '../../../../src/utils/pipe/metadata';
import type { Pipe, PipeMiddleware } from '../../../../src/utils/pipe/types';

type EstablishedState = {
  readonly count: number;
};

type ReplacingState = {
  readonly label: string;
};

declare const root: Pipe;
declare const establisher: PipeMiddleware<EstablishedState>;
declare const replacer: PipeMiddleware<ReplacingState>;

const established = definePipeableMiddleware(establisher, { id: '@fixture/established' } as const);
const replacing = definePipeableMiddleware(replacer, { id: '@fixture/replacing' } as const);

const rejectedState = root.use(established).use(replacing);

rejectedState;
