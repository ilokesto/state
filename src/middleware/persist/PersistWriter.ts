import { PersistError } from './Persist.js';
import type { PersistStatus } from './Persist.js';
import type { PersistedValue, PersistStorage } from './storage/PersistStorage.js';

type Write = {
  /** Monotonically increasing identifier used to settle flush requests. */
  readonly id: number;
  /** Clear generation in which this write was queued. */
  readonly generation: number;
  /** Produces the persisted value when the write actually starts. */
  readonly value: () => PersistedValue;
};
type Waiter = {
  /** Latest write identifier this flush request must persist. */
  readonly target: number;
  /** Completes the flush request after its target has been saved. */
  readonly resolve: () => void;
  /** Rejects the flush request when persistence fails or is invalidated. */
  readonly reject: (error: PersistError) => void;
};
type Removal = {
  /** Completes the deletion request or idle wait. */
  readonly resolve: () => void;
  /** Rejects the deletion request or idle wait. */
  readonly reject: (error: PersistError) => void;
};

/**
 * @description Serializes persistence using one active I/O operation, one
 * replaceable write, and ordered deletion barriers. Writes begin only after
 * enabling; debouncing, pauses, and sync holds control when they may start.
 * @example
 * ```ts
 * const writer = new PersistWriter(() => storage, 'preferences', publishStatus, 100);
 * writer.enable();
 * writer.enqueue(() => persistedPreferences);
 * await writer.flush();
 * ```
 */
export class PersistWriter {
  private nextId = 0;
  private savedId = 0;
  private generation = 0;
  private pending: Write | undefined;
  private active = false;
  private activeWrite: Write | undefined;
  private enabled = false;
  private disposed = false;
  private paused = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly waiters = new Set<Waiter>();
  private readonly removals: Removal[] = [];
  private holds = 0;
  private heldWrite = false;
  private readonly idleWaiters = new Set<Removal>();

  /**
   * @description Creates an initially disabled writer without performing I/O.
   * @param {() => PersistStorage} storage - Resolves the storage backend for each operation.
   * @param {string} key - Storage key used for writes and deletions.
   * @param {(patch: Partial<PersistStatus>) => void} publish - Receives persistence status patches.
   * @param {number} saveDebounceMs - Write debounce delay in milliseconds; nonpositive values disable the delay.
   * @example
   * ```ts
   * const writer = new PersistWriter(() => storage, 'preferences', publishStatus, 250);
   * writer.enable();
   * ```
   */
  constructor(
    private readonly storage: () => PersistStorage,
    private readonly key: string,
    private readonly publish: (patch: Partial<PersistStatus>) => void,
    private readonly saveDebounceMs: number,
  ) {}

  /**
   * @description Replaces the queued write with a lazy value producer, publishes
   * pending status, and schedules saving. An active write is not canceled.
   * Calls after disposal are ignored. Projection failures are reported as INVALID_DATA.
   * @param {() => PersistedValue} value - Produces the value when this write starts, not when it is enqueued.
   * @example
   * ```ts
   * writer.enqueue(() => persistedPreferences);
   * await writer.flush();
   * ```
   */
  enqueue(value: () => PersistedValue): void {
    if (this.disposed) return;
    this.pending = { id: ++this.nextId, generation: this.generation, value };
    this.publish({ pending: true });
    this.schedule();
  }

  /**
   * @description Enables writes and schedules queued work, respecting pauses,
   * debounce delays, and sync holds. Deletions do not require enabling.
   * @example
   * ```ts
   * writer.enqueue(() => hydratedPreferences);
   * writer.enable();
   * ```
   */
  enable(): void {
    this.enabled = true;
    this.schedule();
  }

  /**
   * @description Pauses automatic writes, cancels the debounce timer, and
   * publishes paused status. Active I/O and deletions continue; flush requests
   * can still force enabled writes.
   * @example
   * ```ts
   * writer.pause();
   * writer.enqueue(() => editedPreferences);
   * writer.resume();
   * ```
   */
  pause(): void {
    this.paused = true;
    this.cancelTimer();
    this.publish({ paused: true });
  }

  /**
   * @description Clears paused status and schedules pending work with the
   * configured debounce delay. This does not enable a disabled writer.
   * @example
   * ```ts
   * writer.pause();
   * writer.enqueue(() => editedPreferences);
   * writer.resume();
   * ```
   */
  resume(): void {
    this.paused = false;
    this.publish({ paused: false });
    this.schedule();
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.cancelTimer();
    if (this.disposed) return;
    if (
      this.enabled && !this.paused && this.pending &&
      this.pending !== this.activeWrite && this.saveDebounceMs > 0
    ) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.start();
      }, this.saveDebounceMs);
    }
    this.start();
  }

  /**
   * @description Drops the queued write and debounce timer and marks all
   * currently issued write identifiers as saved. Does not cancel active I/O,
   * publish status, or settle existing flush promises.
   * @example
   * ```ts
   * writer.pause();
   * writer.enqueue(() => temporaryPreferences);
   * writer.discard();
   * writer.resume();
   * ```
   */
  discard(): void {
    this.cancelTimer();
    this.heldWrite = false;
    this.pending = undefined;
    this.savedId = this.nextId;
  }

  /**
   * @description Reports whether a write remains queued, including an active
   * write if it has not been replaced or discarded.
   * @returns {boolean} True when a pending write exists; false otherwise.
   * @example
   * ```ts
   * if (writer.hasPending()) {
   *   await writer.flush();
   * }
   * ```
   */
  hasPending(): boolean {
    return this.pending !== undefined;
  }

  /**
   * @description Stops new saves while a sync read decides whether pending edits
   * can be replaced. Active I/O and deletion barriers continue. Each hold must
   * be released; only work deferred by holds is restarted, not a previously
   * failed save.
   * @returns {{ readonly ready: Promise<void>; readonly release: () => void }} The hold's readiness and release controls.
   * - ready `Promise<void>` - Resolves when active I/O and queued deletions finish, or when this hold is released; rejects if disposed while waiting.
   * - release `() => void` - Idempotently releases this hold and resolves its outstanding readiness wait. Deferred writes may restart after the last hold is released.
   * @example
   * ```ts
   * const hold = writer.hold();
   * try {
   *   await hold.ready;
   *   const stored = await storage.getItem('preferences');
   *   if (shouldUseStored(stored)) {
   *     writer.discardForSync();
   *   }
   * } finally {
   *   hold.release();
   * }
   * ```
   */
  hold(): { readonly ready: Promise<void>; readonly release: () => void } {
    this.holds += 1;
    let waiter: Removal | undefined;
    const ready = this.active || this.removals.length > 0
      ? new Promise<void>((resolve, reject) => {
        waiter = { resolve, reject };
        this.idleWaiters.add(waiter);
      })
      : Promise.resolve();
    let released = false;
    return {
      ready,
      release: () => {
        if (released) return;
        released = true;
        if (waiter) {
          this.idleWaiters.delete(waiter);
          waiter.resolve();
        }
        this.holds -= 1;
        // Release only work deferred by the barrier, not a previously failed save.
        if (this.holds === 0 && this.heldWrite) {
          this.heldWrite = false;
          this.start();
        }
      },
    };
  }

  /**
   * @description Discards queued local edits and rejects outstanding flush
   * promises with a sync CONFLICT error. Explicit use-stored must reject flush
   * promises for the discarded local edits. Active I/O is not canceled.
   * @example
   * ```ts
   * const hold = writer.hold();
   * try {
   *   await hold.ready;
   *   writer.discardForSync();
   * } finally {
   *   hold.release();
   * }
   * ```
   */
  discardForSync(): void {
    this.discard();
    this.rejectWaiters(new PersistError('sync', 'CONFLICT', 'Pending edits were replaced by stored state'));
  }

  private settleIdle(): void {
    if (this.active || this.removals.length > 0) return;
    for (const waiter of this.idleWaiters) waiter.resolve();
    this.idleWaiters.clear();
  }

  /**
   * @description Requests persistence through the latest currently enqueued
   * write, bypassing debounce and pause but still requiring enablement and the
   * release of sync holds. A later replacement write may satisfy the request.
   * @returns {Promise<void>} Resolves when the target is saved, or immediately
   * when already marked saved. Rejects on persistence failure, clear, sync
   * replacement, or disposal.
   * @example
   * ```ts
   * writer.enable();
   * writer.enqueue(() => persistedPreferences);
   * await writer.flush();
   * ```
   */
  flush(): Promise<void> {
    if (this.disposed) return Promise.reject(this.disposedError());
    if (this.savedId >= this.nextId) return Promise.resolve();
    const target = this.nextId;
    const promise = new Promise<void>((resolve, reject) => {
      this.waiters.add({ target, resolve, reject });
    });
    this.cancelTimer();
    this.start();
    return promise;
  }

  /**
   * @description Invalidates the current write generation, discards queued
   * edits, rejects flush requests with CLEARED, and queues an ordered deletion.
   * Deletion waits for active I/O but bypasses pause, enablement, and sync holds.
   * Writes queued afterward run after queued deletions.
   * @returns {Promise<void>} Resolves when this deletion completes. Rejects on
   * storage failure or disposal, including calls made after disposal.
   * @example
   * ```ts
   * await writer.clear();
   * writer.enqueue(() => defaultPreferences);
   * await writer.flush();
   * ```
   */
  clear(): Promise<void> {
    if (this.disposed) return Promise.reject(this.disposedError());
    this.generation += 1;
    this.discard();
    this.rejectWaiters(new PersistError('clear', 'CLEARED', 'Pending persistence was cleared'));
    const promise = new Promise<void>((resolve, reject) => {
      this.removals.push({ resolve, reject });
    });
    this.publish({ pending: false });
    this.start();
    return promise;
  }

  /**
   * @description Permanently stops scheduling, cancels the debounce timer,
   * drops queued writes, and rejects outstanding flush, deletion, and idle
   * waits with DISPOSED. Already invoked storage operations are not canceled;
   * their completion no longer updates writer status.
   * @example
   * ```ts
   * try {
   *   await writer.flush();
   * } finally {
   *   writer.dispose();
   * }
   * ```
   */
  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
    this.pending = undefined;
    this.activeWrite = undefined;
    const error = this.disposedError();
    this.rejectWaiters(error);
    for (const removal of this.removals.splice(0)) removal.reject(error);
    for (const waiter of this.idleWaiters) waiter.reject(error);
    this.idleWaiters.clear();
  }

  private disposedError(): PersistError {
    return new PersistError('dispose', 'DISPOSED', 'Persistence has been disposed');
  }

  private rejectWaiters(error: PersistError): void {
    for (const waiter of this.waiters) waiter.reject(error);
    this.waiters.clear();
  }

  private start(): void {
    if (this.active || this.disposed) return;
    const removal = this.removals[0];
    const canWrite = this.waiters.size > 0 || (!this.paused && this.timer === undefined);
    if (this.enabled && canWrite && this.pending && this.holds > 0) this.heldWrite = true;
    const write = this.enabled && canWrite && this.holds === 0 ? this.pending : undefined;
    if (!removal && !write) return;
    this.active = true;
    this.activeWrite = removal ? undefined : write;
    this.publish({ saving: 'writing', error: null });
    void Promise.resolve().then(async () => {
      if (this.disposed) return;
      let projectionFailed = false;
      // Capture the job before publishing; status callbacks can enqueue or clear.
      try {
        if (removal) {
          await this.storage().removeItem(this.key);
        } else if (write && write.generation === this.generation) {
          let value: PersistedValue;
          try {
            value = write.value();
          } catch (cause) {
            projectionFailed = true;
            throw cause;
          }
          // User projection can reenter clear/dispose before storage is invoked.
          if (!this.disposed && write.generation === this.generation) {
            await this.storage().setItem(this.key, value);
          }
        }
        if (this.disposed) return;
        if (removal) {
          this.removals.shift();
          removal.resolve();
        } else if (write && write.generation === this.generation) {
          this.savedId = write.id;
          if (this.pending?.id === write.id) this.pending = undefined;
          for (const waiter of this.waiters) {
            if (waiter.target <= this.savedId) {
              this.waiters.delete(waiter);
              waiter.resolve();
            }
          }
        }
        this.active = false;
        this.activeWrite = undefined;
        this.settleIdle();
        this.publish({ saving: 'idle', pending: this.pending !== undefined });
        this.start();
      } catch (cause) {
        if (this.disposed) return;
        const error = new PersistError(
          removal ? 'clear' : 'write',
          projectionFailed ? 'INVALID_DATA' : 'STORAGE',
          projectionFailed ? 'Persistence projection failed' : 'Persistence I/O failed',
          cause,
        );
        if (removal) {
          this.removals.shift();
          removal.reject(error);
        }
        this.active = false;
        this.activeWrite = undefined;
        this.settleIdle();
        // A cleared generation must never poison its replacement's status.
        if (removal || write?.generation === this.generation) {
          this.rejectWaiters(error);
          this.publish({ saving: 'error', pending: this.pending !== undefined, error });
        }
        if (this.removals.length > 0 || (this.pending && this.pending.id !== write?.id)) {
          this.start();
        }
      }
    });
  }
}
