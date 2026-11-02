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
 * @description Adds storage-independent asynchronous persistence with explicit
 * restoration. Creation is side-effect free. Call rehydrate before writes are
 * enabled; edits made before it completes require an explicit conflict policy.
 * Without projection, persistence uses the complete decoded state without
 * implicit merging. With projection, project selects the persisted value and
 * restore reconstructs the store state. Rejects saveDebounceMs outside the
 * finite range 0 through 2147483647 with a RangeError.
 * @param {ProjectedPersistConfig<State, Persisted, Steps> | (SafePersistConfig<DecodedState, Steps> & { readonly project?: never; readonly restore?: never })} options - Persistence configuration for either projected or complete-state storage.
 * @param {string} options.key - Storage entry key for this store.
 * @param {import('./storage/PersistStorage.js').PersistStorageFactory} options.storage - Lazy factory providing the persistence storage.
 * @param {ProjectedPersistConfig<State, Persisted, Steps>['decode'] | SafePersistConfig<DecodedState, Steps>['decode']} options.decode - Required decoder validating the stored representation.
 * @param {SafePersistConfig<DecodedState, Steps>['migrate']} [options.migrate] - Ordered migrations whose adjacent input and output types must form a compatible chain.
 * @param {number} [options.saveDebounceMs] - Save debounce interval in milliseconds; defaults to zero.
 * @param {import('./Persist.js').PersistRehydrateOptions} [options.sync] - Enables automatic synchronization on storage invalidations; requires an adapter with subscribe.
 * @param {import('./Persist.js').PersistConflictPolicy} [options.sync.conflict] - Conflict policy for automatic synchronization; omission reports CONFLICT and retains pending local edits.
 * @param {ProjectedPersistConfig<State, Persisted, Steps>['project']} [options.project] - Required by the projected overload to select the persisted value; forbidden by the complete-state overload.
 * @param {ProjectedPersistConfig<State, Persisted, Steps>['restore']} [options.restore] - Required by the projected overload to reconstruct state from the persisted value; forbidden by the complete-state overload.
 * @returns {SafeCurriedPersist<State> | SafeCurriedPersist<DecodedState>} Pipeable middleware installing persistence controls on the store.
 * - pipeMiddlewareMetadataBrand `PipeMiddlewareMetadata<'@ilokesto/state/persist', readonly [], readonly [PersistCapability], 'reject', readonly [], readonly [], readonly ['@ilokesto/state/debounce']>` - Type-level middleware ordering and capability metadata.
 * : pipeMiddlewareMetadataBrand.adds `readonly [PersistCapability]` - Capabilities supplied by persistence.
 * : pipeMiddlewareMetadataBrand.adds.0 `PersistCapability` - Persistence-control capability.
 * : pipeMiddlewareMetadataBrand.adds.0.id `'@ilokesto/state/persist-controls'` - Stable capability identifier.
 * : pipeMiddlewareMetadataBrand.adds.0.shape `{ readonly persist: PersistControls }` - Store additions described by this capability.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist `PersistControls` - Explicit hydration, saving and lifecycle controls.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.rehydrate `PersistControls['rehydrate']` - Loads and restores persisted state using the requested conflict policy.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.sync `PersistControls['sync']` - Synchronizes the store with persisted state.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.flush `PersistControls['flush']` - Flushes pending persistence work.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.pause `PersistControls['pause']` - Pauses automatic saving.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.resume `PersistControls['resume']` - Resumes automatic saving.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.retry `PersistControls['retry']` - Retries failed persistence work.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.clearStorage `PersistControls['clearStorage']` - Removes this store's persisted entry.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.getStatus `PersistControls['getStatus']` - Reads the current persistence status.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.subscribe `PersistControls['subscribe']` - Subscribes to persistence status changes and returns an unsubscribe function.
 * : pipeMiddlewareMetadataBrand.adds.0.pipeCapabilityBrand `PersistCapability[keyof Omit<PersistCapability, 'id' | 'shape'>]` - Type-level capability brand.
 * : pipeMiddlewareMetadataBrand.after `readonly ['@ilokesto/state/debounce']` - Places persistence after debounce middleware when present.
 * : pipeMiddlewareMetadataBrand.after.0 `'@ilokesto/state/debounce'` - Middleware identifier used for that ordering constraint.
 * : pipeMiddlewareMetadataBrand.before `readonly []` - No middleware must follow persistence.
 * : pipeMiddlewareMetadataBrand.conflicts `readonly []` - No explicit conflicting middleware identifiers.
 * : pipeMiddlewareMetadataBrand.duplicate `'reject'` - Rejects duplicate persistence middleware.
 * : pipeMiddlewareMetadataBrand.id `'@ilokesto/state/persist'` - Stable middleware identifier.
 * : pipeMiddlewareMetadataBrand.requires `readonly []` - No prerequisite capabilities.
 * - pipeStateMismatchKindBrand `'persist-decoder'` - Type-level diagnostic category for incompatible decoded state.
 * @example
 * ```ts
 * const store = pipe.use(persist({
 *   key: 'editor',
 *   storage: indexedDBStorage({ database: 'editor' }),
 *   decode: decodeEditor,
 * })).create(initialEditor);
 * await store.persist.rehydrate();
 * await store.persist.flush();
 * ```
 */
export function persist<State, Persisted, const Steps extends readonly MigrationFn[]>(
  options: ProjectedPersistConfig<State, Persisted, Steps>,
): SafeCurriedPersist<State>;
// The complete-state overload shares the persistence contract above.
/**
 * @description Adds storage-independent asynchronous persistence with explicit
 * restoration. Creation is side-effect free. Call rehydrate before writes are
 * enabled; edits made before it completes require an explicit conflict policy.
 * Without projection, persistence uses the complete decoded state without
 * implicit merging. With projection, project selects the persisted value and
 * restore reconstructs the store state. Rejects saveDebounceMs outside the
 * finite range 0 through 2147483647 with a RangeError.
 * @param {ProjectedPersistConfig<State, Persisted, Steps> | (SafePersistConfig<DecodedState, Steps> & { readonly project?: never; readonly restore?: never })} options - Persistence configuration for either projected or complete-state storage.
 * @param {string} options.key - Storage entry key for this store.
 * @param {import('./storage/PersistStorage.js').PersistStorageFactory} options.storage - Lazy factory providing the persistence storage.
 * @param {ProjectedPersistConfig<State, Persisted, Steps>['decode'] | SafePersistConfig<DecodedState, Steps>['decode']} options.decode - Required decoder validating the stored representation.
 * @param {SafePersistConfig<DecodedState, Steps>['migrate']} [options.migrate] - Ordered migrations whose adjacent input and output types must form a compatible chain.
 * @param {number} [options.saveDebounceMs] - Save debounce interval in milliseconds; defaults to zero.
 * @param {import('./Persist.js').PersistRehydrateOptions} [options.sync] - Enables automatic synchronization on storage invalidations; requires an adapter with subscribe.
 * @param {import('./Persist.js').PersistConflictPolicy} [options.sync.conflict] - Conflict policy for automatic synchronization; omission reports CONFLICT and retains pending local edits.
 * @param {ProjectedPersistConfig<State, Persisted, Steps>['project']} [options.project] - Required by the projected overload to select the persisted value; forbidden by the complete-state overload.
 * @param {ProjectedPersistConfig<State, Persisted, Steps>['restore']} [options.restore] - Required by the projected overload to reconstruct state from the persisted value; forbidden by the complete-state overload.
 * @returns {SafeCurriedPersist<State> | SafeCurriedPersist<DecodedState>} Pipeable middleware installing persistence controls on the store.
 * - pipeMiddlewareMetadataBrand `PipeMiddlewareMetadata<'@ilokesto/state/persist', readonly [], readonly [PersistCapability], 'reject', readonly [], readonly [], readonly ['@ilokesto/state/debounce']>` - Type-level middleware ordering and capability metadata.
 * : pipeMiddlewareMetadataBrand.adds `readonly [PersistCapability]` - Capabilities supplied by persistence.
 * : pipeMiddlewareMetadataBrand.adds.0 `PersistCapability` - Persistence-control capability.
 * : pipeMiddlewareMetadataBrand.adds.0.id `'@ilokesto/state/persist-controls'` - Stable capability identifier.
 * : pipeMiddlewareMetadataBrand.adds.0.shape `{ readonly persist: PersistControls }` - Store additions described by this capability.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist `PersistControls` - Explicit hydration, saving and lifecycle controls.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.rehydrate `PersistControls['rehydrate']` - Loads and restores persisted state using the requested conflict policy.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.sync `PersistControls['sync']` - Synchronizes the store with persisted state.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.flush `PersistControls['flush']` - Flushes pending persistence work.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.pause `PersistControls['pause']` - Pauses automatic saving.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.resume `PersistControls['resume']` - Resumes automatic saving.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.retry `PersistControls['retry']` - Retries failed persistence work.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.clearStorage `PersistControls['clearStorage']` - Removes this store's persisted entry.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.getStatus `PersistControls['getStatus']` - Reads the current persistence status.
 * : pipeMiddlewareMetadataBrand.adds.0.shape.persist.subscribe `PersistControls['subscribe']` - Subscribes to persistence status changes and returns an unsubscribe function.
 * : pipeMiddlewareMetadataBrand.adds.0.pipeCapabilityBrand `PersistCapability[keyof Omit<PersistCapability, 'id' | 'shape'>]` - Type-level capability brand.
 * : pipeMiddlewareMetadataBrand.after `readonly ['@ilokesto/state/debounce']` - Places persistence after debounce middleware when present.
 * : pipeMiddlewareMetadataBrand.after.0 `'@ilokesto/state/debounce'` - Middleware identifier used for that ordering constraint.
 * : pipeMiddlewareMetadataBrand.before `readonly []` - No middleware must follow persistence.
 * : pipeMiddlewareMetadataBrand.conflicts `readonly []` - No explicit conflicting middleware identifiers.
 * : pipeMiddlewareMetadataBrand.duplicate `'reject'` - Rejects duplicate persistence middleware.
 * : pipeMiddlewareMetadataBrand.id `'@ilokesto/state/persist'` - Stable middleware identifier.
 * : pipeMiddlewareMetadataBrand.requires `readonly []` - No prerequisite capabilities.
 * - pipeStateMismatchKindBrand `'persist-decoder'` - Type-level diagnostic category for incompatible decoded state.
 * @example
 * ```ts
 * const store = pipe.use(persist({
 *   key: 'editor',
 *   storage: indexedDBStorage({ database: 'editor' }),
 *   decode: decodeEditor,
 * })).create(initialEditor);
 * await store.persist.rehydrate();
 * await store.persist.flush();
 * ```
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
