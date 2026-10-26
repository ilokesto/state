import type { Store } from '@ilokesto/store';
import { resetRestoreBaseline, restoreSource } from '../../lib/restoreSource.js';
import { validateState } from '../../lib/stateValidation.js';
import { registerStoreCleanup } from '../../lib/storeCleanup.js';
import { PersistError } from './Persist.js';
import type {
  MigrationFn, PersistControls, PersistRehydrateOptions, PersistStatus, ProjectedPersistConfig,
} from './Persist.js';
import { PersistWriter } from './PersistWriter.js';
import { decodePersisted } from './persistUtils.js';
import type { PersistStorage } from './storage/PersistStorage.js';

export function createPersistRuntime<State, Persisted>(
  store: Store<State>,
  options: ProjectedPersistConfig<State, Persisted, readonly MigrationFn[]>,
): PersistControls {
  let status: PersistStatus = Object.freeze({
    hydration: 'idle', saving: 'idle', pending: false, paused: false, disposed: false, error: null,
  });
  let adapter: PersistStorage | undefined;
  let ongoing: Promise<void> | undefined;
  let cancelHydration: ((error: PersistError) => void) | undefined;
  let generation = 0;
  let syncSequence = 0;
  let stopStorageEvents: (() => void) | undefined;
  let syncRequested = false;
  let clearing = 0;
  const syncCancellations = new Set<(error?: PersistError) => void>();
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
  const writer = new PersistWriter(storage, options.key, publish, options.saveDebounceMs ?? 0);
  const enqueue = (state: State): void => {
    writer.enqueue(() => ({ state: options.project(state), version }));
  };
  const unsubscribe = store.subscribeCommit((commit) => {
    if (commit.source === restoreSource) return;
    enqueue(commit.state);
  });

  const prepareRestore = (payload: unknown, operation: 'hydrate' | 'sync') => {
    let decoded: ReturnType<typeof decodePersisted<Persisted>>;
    try {
      decoded = decodePersisted(payload, options.decode, options.migrate ?? []);
    } catch (cause) {
      if (operation === 'hydrate' && cause instanceof PersistError) throw cause;
      throw new PersistError(operation, 'INVALID_DATA', 'Persist migration or decoder failed', cause);
    }
    let restored: State | undefined;
    if (decoded !== null) {
      try {
        const validated = validateState(store, options.restore(decoded.state, store.getState()));
        if ('issues' in validated) {
          throw new PersistError(operation, 'VALIDATION', 'Restored state failed validation', validated.issues);
        }
        restored = validated.value;
      } catch (cause) {
        throw cause instanceof PersistError ? cause :
          new PersistError(operation, 'VALIDATION', 'Restored state validation failed', cause);
      }
    }
    return { decoded, restored };
  };

  const sync = (resolution?: PersistRehydrateOptions): Promise<void> => {
    if (status.disposed) {
      return Promise.reject(new PersistError('dispose', 'DISPOSED', 'Persistence has been disposed'));
    }
    if (status.hydration !== 'hydrated') {
      return Promise.reject(new PersistError('sync', 'NOT_HYDRATED', 'Complete hydration before syncing'));
    }
    if (clearing > 0) {
      return Promise.reject(new PersistError('clear', 'CLEARED', 'Storage is being cleared'));
    }
    const attempt = generation;
    const sequence = ++syncSequence;
    for (const cancel of syncCancellations) cancel();
    const committedAt = store.getCommitSequence();
    const wasPending = writer.hasPending();
    const hold = writer.hold();
    const cancellation = Promise.withResolvers<void>();
    const cancel = (error?: PersistError): void => {
      if (error) cancellation.reject(error);
      else cancellation.resolve();
    };
    syncCancellations.add(cancel);
    const isCurrent = (): boolean =>
      !status.disposed && attempt === generation && sequence === syncSequence;
    const work = async (): Promise<void> => {
      await hold.ready;
      if (!isCurrent()) return;
      let payload: unknown;
      try {
        payload = await storage().getItem(options.key);
      } catch (cause) {
        throw new PersistError('sync', 'STORAGE', 'Could not read external state', cause);
      }
      if (!isCurrent()) return;
      const { decoded, restored } = prepareRestore(payload, 'sync');
      if (!isCurrent()) return;
      const edited = wasPending || writer.hasPending() || store.getCommitSequence() !== committedAt;
      if (edited && resolution?.conflict === undefined) {
        throw new PersistError('sync', 'CONFLICT', 'External state conflicts with local edits');
      }
      if (edited && resolution?.conflict === 'keep-current') {
        // An explicit choice also authorizes retrying a previously failed local save.
        enqueue(store.getState());
        publish({ error: null });
        return;
      }
      writer.discardForSync();
      let notificationError: PersistError | null = null;
      if (decoded !== null) {
        resetRestoreBaseline(store);
        try {
          store.replaceState(restored as State, restoreSource);
        } catch (cause) {
          notificationError = new PersistError('notify', 'NOTIFICATION', 'Sync notification failed', cause);
        }
      }
      // External deletes retain memory; external restores never echo or rewrite migrations.
      if (isCurrent()) publish({ pending: writer.hasPending(), error: notificationError });
    };
    return Promise.race([work(), cancellation.promise]).catch((cause: unknown) => {
      const error = cause instanceof PersistError ? cause :
        new PersistError('sync', 'STORAGE', 'External synchronization failed', cause);
      if (isCurrent()) publish({ error });
      throw error;
    }).finally(() => {
      syncCancellations.delete(cancel);
      hold.release();
    });
  };

  const onStorageChange = (): void => {
    if (status.disposed || clearing > 0) return;
    if (status.hydration !== 'hydrated') {
      syncRequested = true;
      return;
    }
    // Errors are observable through status; event sources cannot consume a promise.
    void sync(options.sync).catch(() => undefined);
  };

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
      const activeStorage = storage();
      if (options.sync !== undefined && !stopStorageEvents) {
        if (!activeStorage.subscribe) throw new TypeError('Automatic sync requires storage.subscribe');
        stopStorageEvents = activeStorage.subscribe(options.key, onStorageChange);
      }
      payload = await activeStorage.getItem(options.key);
    } catch (cause) {
      throw new PersistError('hydrate', 'STORAGE', 'Could not read persisted state', cause);
    }
    assertCurrent();
    const { decoded, restored } = prepareRestore(payload, 'hydrate');
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
      if (decoded.migrated && !syncRequested && attempt === generation && !writer.hasPending()) {
        enqueue(store.getState());
      }
    } else if (keepCurrent) {
      enqueue(store.getState());
    }
    assertActive();
    publish({ hydration: 'hydrated', pending: writer.hasPending(), error: notificationError });
    if (syncRequested) {
      syncRequested = false;
      onStorageChange();
    }
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
    const errors: unknown[] = [];
    unsubscribe();
    try {
      stopStorageEvents?.();
    } catch (error) {
      errors.push(error);
    }
    syncSequence += 1;
    for (const cancel of syncCancellations) {
      cancel(new PersistError('dispose', 'DISPOSED', 'Persistence has been disposed'));
    }
    writer.dispose();
    cancelHydration?.(new PersistError('dispose', 'DISPOSED', 'Persistence has been disposed'));
    publish({ disposed: true, pending: false, saving: 'idle' });
    listeners.clear();
    try {
      adapter?.dispose?.();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Persistence cleanup failed');
  });

  const flush = (): Promise<void> => {
    if (status.disposed) return Promise.reject(new PersistError('dispose', 'DISPOSED', 'Persistence has been disposed'));
    if (status.hydration !== 'hydrated') {
      return Promise.reject(new PersistError('write', 'NOT_HYDRATED', 'Complete hydration before flushing'));
    }
    return writer.flush();
  };

  return {
    rehydrate,
    sync,
    flush,
    retry: flush,
    pause: () => { assertActive(); writer.pause(); },
    resume: () => { assertActive(); writer.resume(); },
    clearStorage: () => {
      generation += 1;
      syncSequence += 1;
      syncRequested = false;
      for (const cancel of syncCancellations) {
        cancel(new PersistError('clear', 'CLEARED', 'Synchronization was invalidated by clearStorage'));
      }
      cancelHydration?.(new PersistError('clear', 'CLEARED', 'Hydration was invalidated by clearStorage'));
      clearing += 1;
      return writer.clear().finally(() => { clearing -= 1; });
    },
    getStatus: () => status,
    subscribe: (listener) => {
      if (status.disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
