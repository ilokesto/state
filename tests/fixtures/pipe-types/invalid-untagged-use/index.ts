import { Store } from '@ilokesto/store';

import { pipe } from '../../../../src/utils/pipe';

const untagged = <State>(store: Store<State>): Store<State> => store;
const rejectedUntaggedUse = pipe.use(untagged);

rejectedUntaggedUse;
