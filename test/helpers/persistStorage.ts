import type { PersistedValue, PersistStorage } from '../../src/middleware';

export function deferred<Value>() {
  return Promise.withResolvers<Value>();
}

export class AsyncMemoryStorage implements PersistStorage {
  value: unknown = null;
  reads = 0;
  readonly writes: PersistedValue[] = [];
  removes = 0;
  disposals = 0;

  async getItem(): Promise<unknown> {
    this.reads += 1;
    return this.value;
  }
  async setItem(_key: string, value: PersistedValue): Promise<void> {
    this.writes.push(value);
    this.value = value;
  }
  async removeItem(): Promise<void> {
    this.removes += 1;
    this.value = null;
  }
  dispose(): void { this.disposals += 1; }
}

export const decodeCounter = (value: unknown): { count: number } | null => {
  if (typeof value !== 'object' || value === null || !('count' in value)) return null;
  return typeof value.count === 'number' ? { count: value.count } : null;
};
