import { pipe } from '../../../../src/utils/pipe';

type LegacyCallRejection<Root> = Root extends (...arguments_: never[]) => unknown
  ? unknown
  : { readonly __pipeCallableRootError: '__pipeCallableRootError' };

const rejectedLegacyCall: LegacyCallRejection<typeof pipe> = true;
const legacyStore = pipe({ count: 0 });

rejectedLegacyCall;
legacyStore;
