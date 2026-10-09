import { PersistError } from './Persist.js';
import type { PersistStatus } from './Persist.js';
import type { PersistedValue, PersistStorage } from './storage/PersistStorage.js';

type Write = { readonly id: number; readonly generation: number; readonly value: PersistedValue };
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
  private enabled = false;
  private disposed = false;
  private readonly waiters = new Set<Waiter>();
  private readonly removals: Removal[] = [];

  constructor(
    private readonly storage: () => PersistStorage,
    private readonly key: string,
    private readonly publish: (patch: Partial<PersistStatus>) => void,
  ) {}

  enqueue(value: PersistedValue): void {
    if (this.disposed) return;
    this.pending = { id: ++this.nextId, generation: this.generation, value };
    this.publish({ pending: true });
    this.start();
  }

  enable(): void {
    this.enabled = true;
    this.start();
  }

  discard(): void {
    this.pending = undefined;
    this.savedId = this.nextId;
  }

  hasPending(): boolean {
    return this.pending !== undefined;
  }

  flush(): Promise<void> {
    if (this.disposed) return Promise.reject(this.disposedError());
    if (this.savedId >= this.nextId) return Promise.resolve();
    const target = this.nextId;
    const promise = new Promise<void>((resolve, reject) => {
      this.waiters.add({ target, resolve, reject });
    });
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
    this.pending = undefined;
    const error = this.disposedError();
    this.rejectWaiters(error);
    for (const removal of this.removals.splice(0)) removal.reject(error);
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
    const write = this.enabled ? this.pending : undefined;
    if (!removal && !write) return;
    this.active = true;
    this.publish({ saving: 'writing', error: null });
    void Promise.resolve().then(async () => {
      if (this.disposed) return;
      // Capture the job before publishing; status callbacks can enqueue or clear.
      try {
        if (removal) {
          await this.storage().removeItem(this.key);
        } else if (write && write.generation === this.generation) {
          await this.storage().setItem(this.key, write.value);
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
        this.publish({ saving: 'idle', pending: this.pending !== undefined });
        this.start();
      } catch (cause) {
        if (this.disposed) return;
        const error = new PersistError(removal ? 'clear' : 'write', 'STORAGE', 'Persistence I/O failed', cause);
        if (removal) {
          this.removals.shift();
          removal.reject(error);
        }
        this.active = false;
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
