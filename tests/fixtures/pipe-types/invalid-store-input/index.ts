import { Store } from '@ilokesto/store';

import { definePipeableMiddleware } from '../../../../src/utils/pipe/metadata';
import { pipe } from '../../../../src/utils/pipe';
import type { PipeAnyMiddleware } from '../../../../src/utils/pipe/types';

const identityMiddleware: PipeAnyMiddleware = <State>(store: Store<State>): Store<State> => store;
const identity = definePipeableMiddleware(identityMiddleware, {
  id: '@fixture/identity',
} as const);

const rejectedStoreInput = pipe.use(identity).create(new Store({ count: 0 }));

rejectedStoreInput;
