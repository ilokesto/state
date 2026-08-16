import { Store } from '@ilokesto/store';
import { getStore } from '../../lib/getStore.js';
import { definePipeableMiddleware } from '../../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../../utils/pipe/metadata.js';
import type {
  PipeAnyMiddleware,
  PipeCapability,
  PipeMiddleware,
  PipeMiddlewareMetadata,
} from '../../utils/pipe/types.js';
import type {
  MigrationFn,
  OnRehydrateStorage,
  PersistControls,
  PersistStore,
  SafePersistConfig,
} from './Persist.js';
import { getSafeStorage, parseOptions, setStorage } from './persistUtils.js';

type PersistMetadata = PipeMiddlewareMetadata<
  '@ilokesto/state/persist',
  readonly [],
  readonly [],
  'reject',
  readonly []
>;

type PersistCapability = PipeCapability<
  '@ilokesto/state/persist-controls',
  { readonly persist: PersistControls<unknown> }
>;

const persistCapability = {
  id: '@ilokesto/state/persist-controls',
  shape: {
    persist: {
      hasHydrated: (): boolean => false,
      rehydrate: (): void => undefined,
    },
  },
} satisfies PersistCapability;

type SafeCurriedPersist<State> = PipeableMiddleware<
  PipeMiddleware<State>,
  PipeMiddlewareMetadata<
    '@ilokesto/state/persist',
    readonly [],
    readonly [PersistCapability],
    'reject',
    readonly []
  >,
  'persist-decoder'
>;

const definePersistControls = <State>(
  store: Store<State>,
  controls: PersistControls<State>,
): PersistStore<State> => {
  Object.defineProperties(store, {
    persist: { configurable: false, enumerable: true, value: controls, writable: false },
  });
  return store as PersistStore<State>;
};

const applyPersist = <T>(
  initialState: T | Store<T>,
  options: SafePersistConfig<T, readonly MigrationFn[]>,
): PersistStore<T> => {
  const store = getStore(initialState);
  const baseSetState = store.setState.bind(store);
  const optionObj = parseOptions(options);
  const skipHydration = options.skipHydration === true;
  const onRehydrateStorage: OnRehydrateStorage<T> | undefined = options.onRehydrateStorage;

  let hydrated = false;
  let prevPersistedState = store.getState() as T;

  const runRehydration = (fallbackState: T) => {
    if (!optionObj.storageType) {
      return { kind: 'empty', state: fallbackState, version: optionObj.storageVersion } as const;
    }

    return getSafeStorage({
      ...optionObj,
      decode: options.decode,
      initState: fallbackState,
    });
  };

  const rehydrate = (): void => {
    if (hydrated) return;

    const preState = store.getState() as T;
    const callback = onRehydrateStorage?.(preState);
    const result = runRehydration(preState);

    switch (result.kind) {
      case 'hydrated':
        baseSetState(result.state);
        prevPersistedState = result.state;
        hydrated = true;
        callback?.(store.getState() as T, undefined);
        break;
      case 'empty':
        prevPersistedState = preState;
        hydrated = true;
        callback?.(preState, undefined);
        break;
      case 'failed':
        hydrated = true;
        callback?.(undefined, result.error);
        break;
    }
  };

  const controls: PersistControls<T> = {
    hasHydrated: () => hydrated,
    rehydrate,
  };

  const persistedStore = definePersistControls(store, controls);

  if (!skipHydration) {
    rehydrate();
  }

  if (optionObj.storageType) {
    store.pushMiddleware((nextState, next) => {
      next(nextState);

      const currentAfterUpdate = store.getState() as T;

      if (!Object.is(prevPersistedState, currentAfterUpdate)) {
        setStorage({ ...optionObj, value: currentAfterUpdate });
        prevPersistedState = currentAfterUpdate;
      }
    });
  }

  return persistedStore;
};

export function persist<DecodedState, const Steps extends readonly MigrationFn[]>(
  options: SafePersistConfig<DecodedState, Steps>,
): SafeCurriedPersist<DecodedState>;
export function persist<DecodedState, const Steps extends readonly MigrationFn[]>(
  options: SafePersistConfig<DecodedState, Steps>,
): object {
  return definePipeableMiddleware(
    <State>(initialState: State | Store<State>) =>
      applyPersist<State>(
        initialState,
        options as unknown as SafePersistConfig<State, readonly MigrationFn[]>,
      ),
    {
      adds: [persistCapability],
      after: [],
      before: [],
      conflicts: [],
      duplicate: 'reject',
      id: '@ilokesto/state/persist',
      requires: [],
    } as const,
  );
}
