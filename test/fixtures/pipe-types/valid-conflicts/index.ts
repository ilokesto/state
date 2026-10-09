import { jsonStorage } from '../../../../src/middleware';
import { debounce, devtools, history, logger, persist, throttle, validate } from '../../../../src/middleware';
import { definePipeableMiddleware } from '../../../../src/utils/pipe/metadata';
import type {
  PipeMiddlewareAppendValidation,
  PipeMiddlewareConflictDiagnostic,
  PipeRegisteredMetadataFor,
} from '../../../../src/utils/pipe/types';
import { pipe } from '../../../../src/utils/pipe';

type IsExact<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

const historyMiddleware = history();
const debounceMiddleware = debounce();
const throttleMiddleware = throttle();
const devtoolsMiddleware = devtools('fixture');
const loggerMiddleware = logger();
const persistMiddleware = persist({ decode: () => null, key: 'fixture', storage: jsonStorage(() => localStorage)});
const validateMiddleware = validate({
  '~standard': {
    validate: (value: unknown) => ({ value }),
    vendor: 'fixture',
    version: 1 as const,
  },
});
const conflictSource = definePipeableMiddleware(
  <State>(store: import('@ilokesto/store').Store<State>) => store,
  {
    conflicts: ['@fixture/conflict-target'],
    id: '@fixture/conflict-source',
  } as const,
);
const conflictTarget = definePipeableMiddleware(
  <State>(store: import('@ilokesto/store').Store<State>) => store,
  { id: '@fixture/conflict-target' } as const,
);

const historyConflictsAreExact: IsExact<
  PipeRegisteredMetadataFor<typeof historyMiddleware>['conflicts'],
  readonly ['@ilokesto/state/debounce', '@ilokesto/state/throttle']
> = true;
const debounceConflictsAreExact: IsExact<
  PipeRegisteredMetadataFor<typeof debounceMiddleware>['conflicts'],
  readonly []
> = true;
const throttleConflictsAreExact: IsExact<
  PipeRegisteredMetadataFor<typeof throttleMiddleware>['conflicts'],
  readonly []
> = true;
const devtoolsConflictsAreExact: IsExact<
  PipeRegisteredMetadataFor<typeof devtoolsMiddleware>['conflicts'],
  readonly []
> = true;
const loggerConflictsAreExact: IsExact<
  PipeRegisteredMetadataFor<typeof loggerMiddleware>['conflicts'],
  readonly []
> = true;
const validateConflictsAreExact: IsExact<
  PipeRegisteredMetadataFor<typeof validateMiddleware>['conflicts'],
  readonly []
> = true;
const persistConflictsAreExact: IsExact<
  PipeRegisteredMetadataFor<typeof persistMiddleware>['conflicts'],
  readonly []
> = true;
const exactDiagnostic: PipeMiddlewareAppendValidation<
  readonly [PipeRegisteredMetadataFor<typeof conflictSource>],
  PipeRegisteredMetadataFor<typeof conflictTarget>
> = {
  __pipeMiddlewareConflictError: '__pipeMiddlewareConflictError',
  conflict: '@fixture/conflict-target',
  middleware: '@fixture/conflict-source',
};
const publicDiagnostic: PipeMiddlewareConflictDiagnostic<
  '@fixture/conflict-source',
  '@fixture/conflict-target'
> = exactDiagnostic;

pipe.use(conflictSource);
historyConflictsAreExact;
debounceConflictsAreExact;
throttleConflictsAreExact;
devtoolsConflictsAreExact;
loggerConflictsAreExact;
persistConflictsAreExact;
validateConflictsAreExact;
publicDiagnostic;
