import type { Store } from '@ilokesto/store';
import { resetRestoreBaseline, restoreSource } from '../../lib/restoreSource.js';
import { validateState } from '../../lib/stateValidation.js';
import { registerStoreCleanup } from '../../lib/storeCleanup.js';
import { PersistError } from './Persist.js';
import type {
  MigrationFn, PersistControls, PersistRehydrateOptions, PersistStatus, SafePersistConfig,
} from './Persist.js';
import { PersistWriter } from './PersistWriter.js';
import { decodePersisted } from './persistUtils.js';
import type { PersistStorage } from './storage/PersistStorage.js';

export function createPersistRuntime<State>(
  store: Store<State>,
  options: SafePersistConfig<State, readonly MigrationFn[]>,
): PersistControls {
  let status: PersistStatus = Object.freeze({
    hydration: 'idle', saving: 'idle', pending: false, disposed: false, error: null,
  });
  let adapter: PersistStorage | undefined;
  let ongoing: Promise<void> | undefined;
  let cancelHydration: ((error: PersistError) => void) | undefined;
  let generation = 0;
  const createdAt = store.getCommitSequence();
  const listeners = new Set<(status: PersistStatus) => void>();
  const version = options.migrate?.length ?? 0;

  const publish = (patch: Partial<PersistStatus>): void => {
    if (status.disposed) return;
    status = Object.freeze({ ...status, ...patch });
    const snapshot = status;
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try {
        listener(snapshot);
      } catch (cause) {
        status = Object.freeze({
          ...status,
          error: new PersistError('notify', 'NOTIFICATION', 'Persistence status listener failed', cause),
        });
      }
    }
  };
  const assertActive = (): void => {
    if (status.disposed) {
      throw new PersistError('dispose', 'DISPOSED', 'Persistence has been disposed');
    }
  };
  const storage = (): PersistStorage => {
    assertActive();
    adapter ??= options.storage();
    return adapter;
  };
  const writer = new PersistWriter(storage, options.key, publish);
  const unsubscribe = store.subscribeCommit((commit) => {
    if (commit.source === restoreSource) return;
    writer.enqueue({ state: commit.state, version });
  });

  const hydrate = async (attempt: number, resolution?: PersistRehydrateOptions): Promise<void> => {
    const assertCurrent = (): void => {
      assertActive();
      if (attempt !== generation) {
        throw new PersistError('clear', 'CLEARED', 'Hydration was invalidated by clearStorage');
      }
    };
    assertCurrent();
    let payload: unknown;
    try {
      payload = await storage().getItem(options.key);
    } catch (cause) {
      throw new PersistError('hydrate', 'STORAGE', 'Could not read persisted state', cause);
    }
    assertCurrent();
    let decoded: ReturnType<typeof decodePersisted<State>>;
    try {
      decoded = decodePersisted(payload, options.decode, options.migrate ?? []);
    } catch (cause) {
      throw cause instanceof PersistError ? cause :
        new PersistError('hydrate', 'INVALID_DATA', 'Persist migration or decoder failed', cause);
    }
    let restored: State | undefined;
    if (decoded !== null) {
      try {
        const validated = validateState(store, decoded.state);
        if ('issues' in validated) {
          throw new PersistError('hydrate', 'VALIDATION', 'Restored state failed validation', validated.issues);
        }
        restored = validated.value;
      } catch (cause) {
        throw cause instanceof PersistError ? cause :
          new PersistError('hydrate', 'VALIDATION', 'Restored state validation failed', cause);
      }
    }
    assertCurrent();
    const edited = store.getCommitSequence() !== createdAt;
    if (edited && resolution?.conflict === undefined) {
      throw new PersistError('hydrate', 'CONFLICT', 'State changed before hydration completed');
    }
    const keepCurrent = edited && resolution?.conflict === 'keep-current';
    // From this boundary, cancellation must not turn an applied restore into
    // a retry. A clear triggered by its notifications still invalidates writes.
    cancelHydration = undefined;
    let notificationError: PersistError | null = null;
    if (!keepCurrent && decoded !== null) {
      writer.discard();
      resetRestoreBaseline(store);
      try {
        store.replaceState(restored as State, restoreSource);
      } catch (cause) {
        // replaceState only throws after committing and draining notifications.
        notificationError = new PersistError('notify', 'NOTIFICATION', 'Restoration notification failed', cause);
      }
      // Reentrant user commits take priority over a migration rewrite.
      if (decoded.migrated && attempt === generation && !writer.hasPending()) {
        writer.enqueue({ state: store.getState(), version });
      }
    } else if (keepCurrent) {
      writer.enqueue({ state: store.getState(), version });
    }
    assertActive();
    publish({ hydration: 'hydrated', pending: writer.hasPending(), error: notificationError });
    writer.enable();
  };

  const rehydrate = (resolution?: PersistRehydrateOptions): Promise<void> => {
    if (status.disposed) {
      return Promise.reject(new PersistError('dispose', 'DISPOSED', 'Persistence has been disposed'));
    }
    if (ongoing) return ongoing;
    if (status.hydration === 'hydrated') return Promise.resolve();
    const cancelled = new Promise<never>((_, reject) => { cancelHydration = reject; });
    const attempt = generation;
    // Assign ongoing before status callbacks can reenter rehydrate.
    ongoing = Promise.race([Promise.resolve().then(() => hydrate(attempt, resolution)), cancelled])
      .catch((cause: unknown) => {
        const error = cause instanceof PersistError ? cause :
          new PersistError('hydrate', 'STORAGE', 'Hydration failed', cause);
        publish({ hydration: error.code === 'CONFLICT' ? 'conflict' : 'error', error });
        throw error;
      })
      .finally(() => {
        ongoing = undefined;
        cancelHydration = undefined;
      });
    publish({ hydration: 'hydrating', error: null });
    return ongoing;
  };

  registerStoreCleanup(store, () => {
    if (status.disposed) return;
    unsubscribe();
    writer.dispose();
    cancelHydration?.(new PersistError('dispose', 'DISPOSED', 'Persistence has been disposed'));
    publish({ disposed: true, pending: false, saving: 'idle' });
    listeners.clear();
    adapter?.dispose?.();
  });

  return {
    rehydrate,
    flush: () => {
      if (status.disposed) return Promise.reject(new PersistError('dispose', 'DISPOSED', 'Persistence has been disposed'));
      if (status.hydration !== 'hydrated') {
        return Promise.reject(new PersistError('write', 'NOT_HYDRATED', 'Complete hydration before flushing'));
      }
      return writer.flush();
    },
    clearStorage: () => {
      generation += 1;
      cancelHydration?.(new PersistError('clear', 'CLEARED', 'Hydration was invalidated by clearStorage'));
      return writer.clear();
    },
    getStatus: () => status,
    subscribe: (listener) => {
      if (status.disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
