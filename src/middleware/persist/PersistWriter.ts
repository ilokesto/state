import { PersistError } from './Persist.js';
import type { PersistStatus } from './Persist.js';
import type { PersistedValue, PersistStorage } from './storage/PersistStorage.js';

type Write = { readonly id: number; readonly generation: number; readonly value: () => PersistedValue };
type Waiter = {
  readonly target: number;
  readonly resolve: () => void;
  readonly reject: (error: PersistError) => void;
};
type Removal = { readonly resolve: () => void; readonly reject: (error: PersistError) => void };

/** One active I/O operation, one replaceable write, and ordered deletion barriers. */
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

  constructor(
    private readonly storage: () => PersistStorage,
    private readonly key: string,
    private readonly publish: (patch: Partial<PersistStatus>) => void,
    private readonly saveDebounceMs: number,
  ) {}

  enqueue(value: () => PersistedValue): void {
    if (this.disposed) return;
    this.pending = { id: ++this.nextId, generation: this.generation, value };
    this.publish({ pending: true });
    this.schedule();
  }

  enable(): void {
    this.enabled = true;
    this.schedule();
  }

  pause(): void {
    this.paused = true;
    this.cancelTimer();
    this.publish({ paused: true });
  }

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

  discard(): void {
    this.cancelTimer();
    this.heldWrite = false;
    this.pending = undefined;
    this.savedId = this.nextId;
  }

  hasPending(): boolean {
    return this.pending !== undefined;
  }

  /** Stops new saves while a sync read decides whether pending edits can be replaced. */
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

  /** Explicit use-stored must reject flush promises for the discarded local edits. */
  discardForSync(): void {
    this.discard();
    this.rejectWaiters(new PersistError('sync', 'CONFLICT', 'Pending edits were replaced by stored state'));
  }

  private settleIdle(): void {
    if (this.active || this.removals.length > 0) return;
    for (const waiter of this.idleWaiters) waiter.resolve();
    this.idleWaiters.clear();
  }

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
