import { pipe } from '../../../../src/utils/pipe';

type RootCreateRejection<Root> = Root extends { readonly create: Function }
  ? unknown
  : { readonly __pipeRootCreateError: '__pipeRootCreateError' };

const rejectedRootCreate: RootCreateRejection<typeof pipe> = true;

rejectedRootCreate;
