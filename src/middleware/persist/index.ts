import type { Store } from '@ilokesto/store';
import { getStore } from '../../lib/getStore.js';
import { definePipeableMiddleware } from '../../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../../utils/pipe/metadata.js';
import type { PipeCapability, PipeMiddleware, PipeMiddlewareMetadata } from '../../utils/pipe/types.js';
import type { MigrationFn, PersistControls, PersistStore, ProjectedPersistConfig, SafePersistConfig } from './Persist.js';
import { createPersistRuntime } from './createPersistRuntime.js';

type PersistCapability = PipeCapability<
  '@ilokesto/state/persist-controls',
  { readonly persist: PersistControls }
>;

const persistCapability: PersistCapability = {
  id: '@ilokesto/state/persist-controls',
  shape: {
    persist: {
      rehydrate: async () => undefined,
      sync: async () => undefined,
      flush: async () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      retry: async () => undefined,
      clearStorage: async () => undefined,
      getStatus: () => ({
        hydration: 'idle', saving: 'idle', pending: false, paused: false, disposed: false, error: null,
      } as const),
      subscribe: () => () => undefined,
    },
  },
} satisfies PersistCapability;

type SafeCurriedPersist<State> = PipeableMiddleware<
  PipeMiddleware<State>,
  PipeMiddlewareMetadata<
    '@ilokesto/state/persist', readonly [], readonly [PersistCapability], 'reject',
    readonly [], readonly [], readonly ['@ilokesto/state/debounce']
  >,
  'persist-decoder'
>;

/**
 * Adds storage-independent asynchronous persistence with explicit restoration.
 * Creation is side-effect free. Call rehydrate before writes are enabled;
 * edits made before it completes require an explicit conflict policy.
 * @param options - Entry key, lazy storage factory, required decoder and migrations.
 * @returns Middleware adding persistence controls to the created store.
 * @example
 * const store = pipe.use(persist({
 *   key: 'editor', storage: indexedDBStorage({ database: 'editor' }), decode: decodeEditor,
 * })).create(initialEditor);
 * await store.persist.rehydrate();
 * await store.persist.flush();
 */
export function persist<State, Persisted, const Steps extends readonly MigrationFn[]>(
  options: ProjectedPersistConfig<State, Persisted, Steps>,
): SafeCurriedPersist<State>;
/**
 * Persists the complete decoded state without projection or implicit merging.
 * @param options - Entry key, lazy storage factory, decoder, and save controls.
 * @returns Middleware adding explicit hydration and persistence controls.
 */
export function persist<DecodedState, const Steps extends readonly MigrationFn[]>(
  options: SafePersistConfig<DecodedState, Steps> & { readonly project?: never; readonly restore?: never },
): SafeCurriedPersist<DecodedState>;
export function persist<State, Persisted, const Steps extends readonly MigrationFn[]>(
  options: SafePersistConfig<State, Steps> | ProjectedPersistConfig<State, Persisted, Steps>,
): object {
  const wait = options.saveDebounceMs ?? 0;
  if (!Number.isFinite(wait) || wait < 0 || wait > 2_147_483_647) {
    throw new RangeError('saveDebounceMs must be between 0 and 2147483647');
  }
  return definePipeableMiddleware(
    (initialState: State | Store<State>) => {
      const store = getStore(initialState);
      const controls = 'project' in options
        ? createPersistRuntime(store, options)
        : createPersistRuntime(store, {
          ...options, project: (state: State) => state, restore: (state: State) => state,
        });
      Object.defineProperty(store, 'persist', {
        configurable: false, enumerable: true, value: controls, writable: false,
      });
      return store as PersistStore<State>;
    },
    {
      adds: [persistCapability], after: ['@ilokesto/state/debounce'], before: [],
      conflicts: [], duplicate: 'reject', id: '@ilokesto/state/persist', requires: [],
    } as const,
  );
}
