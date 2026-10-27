import { pipe } from '../../../../src/utils/pipe';

type CallableRootRejection<Root> = Root extends (...arguments_: never[]) => unknown
  ? unknown
  : { readonly __pipeCallableRootError: '__pipeCallableRootError' };

const rejectedCallableRoot: CallableRootRejection<typeof pipe> = true;

rejectedCallableRoot;
