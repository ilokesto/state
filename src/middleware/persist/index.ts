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
  const currentState = store.getState() as T;
  const skipHydration = options.skipHydration === true;
  const onRehydrateStorage = options.onRehydrateStorage as OnRehydrateStorage<T> | undefined;

  let hydrated = false;

  const runRehydration = (): { readonly value: T; readonly didHydrate: boolean } => {
    if (!optionObj.storageType) {
      return { value: currentState, didHydrate: false };
    }

    const result = getSafeStorage({
      ...optionObj,
      decode: options.decode,
      initState: currentState,
    });

    return { value: result.state, didHydrate: true };
  };

  const initialHydration = skipHydration
    ? { value: currentState, didHydrate: false }
    : runRehydration();

  if (initialHydration.didHydrate) {
    baseSetState(initialHydration.value);
  }

  hydrated = !skipHydration;

  let prevPersistedState = initialHydration.value;

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

  const rehydrate = () => {
    if (hydrated) return;

    const result = runRehydration();

    if (result.didHydrate) {
      baseSetState(result.value);
      prevPersistedState = result.value;
    }

    hydrated = true;

    if (onRehydrateStorage) {
      const callback = onRehydrateStorage(store.getState() as T);
      try {
        callback(store.getState() as T, undefined);
      } catch (error) {
        callback(undefined, error);
      }
    }
  };

  const controls: PersistControls<T> = {
    hasHydrated: () => hydrated,
    rehydrate,
  };

  definePersistControls(store, controls);
  return store as PersistStore<T>;
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