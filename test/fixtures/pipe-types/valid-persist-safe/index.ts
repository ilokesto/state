import { Store } from '@ilokesto/store';

import { logger, persist, validate } from '../../../../src/middleware';
import type {
  PersistDecoder,
  PersistMigration,
  PersistStore,
  SafePersistConfig,
} from '../../../../src/middleware';
import { definePipeableMiddleware } from '../../../../src/utils/pipe/metadata';
import { pipe } from '../../../../src/utils/pipe';
import type { PipeMiddleware } from '../../../../src/utils/pipe/types';

type V1 = {
  readonly value: number;
};

type CounterState = {
  readonly count: number;
};

const decodeCounter: PersistDecoder<CounterState> = (value) => {
  if (typeof value !== 'object' || value === null || !('count' in value)) {
    return null;
  }

  return typeof value.count === 'number' ? { count: value.count } : null;
};
const toV1: PersistMigration<unknown, V1> = () => ({ value: 1 });
const toCounter: PersistMigration<V1, CounterState> = (state) => ({ count: state.value });
const safeLocalConfig = {
  decode: decodeCounter,
  local: 'safe-local-variable',
  migrate: [toV1, toCounter],
  skipHydration: true,
  onRehydrateStorage: (state: CounterState | undefined) => (s, error) => {
    void s;
    void error;
    void state;
  },
} as const satisfies SafePersistConfig<CounterState, readonly [typeof toV1, typeof toCounter]>;
const counterSchema = {
  '~standard': {
    validate: (value: unknown) => ({ value: decodeCounter(value) ?? { count: 0 } }),
    vendor: 'fixture',
    version: 1 as const,
  },
} as const;
declare const counterMiddleware: PipeMiddleware<CounterState>;
const taggedCounterMiddleware = definePipeableMiddleware(counterMiddleware, {
  id: '@fixture/counter',
} as const);

const directLocal: PersistStore<CounterState> = pipe.use(persist(safeLocalConfig)).create({ count: 0 });
const directCookie: PersistStore<CounterState> = pipe
  .use(persist({ cookie: 'safe-cookie', decode: decodeCounter }))
  .create({ count: 0 });
const directSession: PersistStore<CounterState> = pipe
  .use(persist({ decode: decodeCounter, session: 'safe-session' }))
  .create({ count: 0 });
const curriedLocal: PersistStore<CounterState> = pipe.use(persist(safeLocalConfig)).create({ count: 0 });
const curriedCookie: PersistStore<CounterState> = pipe
  .use(persist({ cookie: 'safe-cookie-pipe', decode: decodeCounter }))
  .create({ count: 0 });
const curriedSession: PersistStore<CounterState> = pipe
  .use(persist({ decode: decodeCounter, session: 'safe-session-pipe' }))
  .create({ count: 0 });
const persistBeforeValidate: PersistStore<CounterState> = pipe
  .use(persist({ decode: decodeCounter, local: 'before-validate' }))
  .use(validate(counterSchema))
  .create({ count: 0 });
const persistAfterValidate: PersistStore<CounterState> = pipe
  .use(validate(counterSchema))
  .use(persist({ decode: decodeCounter, local: 'after-validate' }))
  .create({ count: 0 });
const persistBeforeCustom: PersistStore<CounterState> = pipe
  .use(persist({ decode: decodeCounter, local: 'before-custom' }))
  .use(taggedCounterMiddleware)
  .create({ count: 0 });
const persistAfterCustom: PersistStore<CounterState> = pipe
  .use(taggedCounterMiddleware)
  .use(persist({ decode: decodeCounter, local: 'after-custom' }))
  .create({ count: 0 });
const persistBeforeLogger: PersistStore<CounterState> = pipe
  .use(persist({ decode: decodeCounter, local: 'before-logger' }))
  .use(logger())
  .create({ count: 0 });
const persistAfterLogger: PersistStore<CounterState> = pipe
  .use(logger())
  .use(persist({ decode: decodeCounter, local: 'after-logger' }))
  .create({ count: 0 });

directLocal.getState().count;
directCookie.getState().count;
directSession.getState().count;
curriedLocal.getState().count;
curriedCookie.getState().count;
curriedSession.getState().count;
persistBeforeValidate.getState().count;
persistAfterValidate.getState().count;
persistBeforeCustom.getState().count;
persistAfterCustom.getState().count;
persistBeforeLogger.getState().count;
persistAfterLogger.getState().count;

directLocal.persist.hasHydrated();
directLocal.persist.rehydrate();
directCookie.persist.hasHydrated();
directCookie.persist.rehydrate();
directSession.persist.hasHydrated();
directSession.persist.rehydrate();

void Store;
