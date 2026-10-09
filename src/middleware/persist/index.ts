import type { Store } from '@ilokesto/store';
import { getStore } from '../../lib/getStore.js';
import { definePipeableMiddleware } from '../../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../../utils/pipe/metadata.js';
import type { PipeCapability, PipeMiddleware, PipeMiddlewareMetadata } from '../../utils/pipe/types.js';
import type { MigrationFn, PersistControls, PersistStore, SafePersistConfig } from './Persist.js';
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
      flush: async () => undefined,
      clearStorage: async () => undefined,
      getStatus: () => ({
        hydration: 'idle', saving: 'idle', pending: false, disposed: false, error: null,
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
export function persist<DecodedState, const Steps extends readonly MigrationFn[]>(
  options: SafePersistConfig<DecodedState, Steps>,
): SafeCurriedPersist<DecodedState>;
export function persist<DecodedState, const Steps extends readonly MigrationFn[]>(
  options: SafePersistConfig<DecodedState, Steps>,
): object {
  return definePipeableMiddleware(
    (initialState: DecodedState | Store<DecodedState>) => {
      const store = getStore(initialState);
      const controls = createPersistRuntime(store, options);
      Object.defineProperty(store, 'persist', {
        configurable: false, enumerable: true, value: controls, writable: false,
      });
      return store as PersistStore<DecodedState>;
    },
    {
      adds: [persistCapability], after: ['@ilokesto/state/debounce'], before: [],
      conflicts: [], duplicate: 'reject', id: '@ilokesto/state/persist', requires: [],
    } as const,
  );
}
