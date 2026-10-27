import { createOutbox, OutboxError } from '@ilokesto/state';
import type {
  Outbox, OutboxContext, OutboxEntry, OutboxOptions, OutboxRecord, OutboxResolution,
  OutboxResponse, OutboxState, ReadableStore, ResourceResult,
} from '@ilokesto/state';
import type { PersistStorageFactory } from '@ilokesto/state/middleware';

type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Operation = { readonly amount: number };
type Conflict = { readonly version: number };
const storage: PersistStorageFactory = () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
});
const options: OutboxOptions<Operation, Conflict> = {
  key: 'account:one:outbox', storage,
  decode: value => typeof value === 'object' && value !== null &&
    'amount' in value && typeof value.amount === 'number' ? { amount: value.amount } : null,
  transport(record: OutboxRecord<Operation>, context: OutboxContext): OutboxResponse<Conflict> {
    const signal: AbortSignal = context.signal;
    const key: string = context.key;
    void signal; void key;
    return { status: 'ack', id: record.id };
  },
  resolve(record, conflict): OutboxResolution<Operation> {
    const version: number = conflict.version;
    void version;
    return { action: 'replace', record: { ...record, id: 'new-id' } };
  },
  retry: { maxAttempts: 3, delayMs: attempt => attempt * 10 },
};
const inferred = createOutbox(options);
const outbox: Outbox<Operation> = inferred;
const readable: ReadableStore<OutboxState<Operation>> = outbox.store;
const enqueue: Promise<void> = outbox.enqueue({ id: 'one', operation: { amount: 1 } });
const flush: Promise<ResourceResult<void>> = outbox.flush();
const entry: OutboxEntry<Operation> | undefined = readable.getState().entries[0];
if (entry) {
  const amount: number = entry.operation.amount;
  const error: unknown = entry.error;
  void amount; void error;
}
const failure: Error = new OutboxError('CONFLICT', 'Resolve explicitly', { cause: { version: 1 } });
type InferredOperation = Assert<Equal<Parameters<typeof inferred.enqueue>[0], OutboxRecord<Operation>>>;
type NoStoreWrite = Assert<Equal<'set' extends keyof typeof readable ? true : false, false>>;
type RequiredKey = Assert<Equal<{} extends Pick<OutboxOptions<Operation>, 'key'> ? true : false, false>>;
type RequiredDecoder = Assert<Equal<{} extends Pick<OutboxOptions<Operation>, 'decode'> ? true : false, false>>;
type States = Assert<Equal<OutboxEntry<Operation>['status'], 'pending' | 'inflight' | 'error'>>;
type Responses = Assert<Equal<OutboxResponse['status'], 'ack' | 'conflict'>>;
void enqueue; void flush; void failure;
export type OutboxTypeContracts = InferredOperation | NoStoreWrite | RequiredKey | RequiredDecoder | States | Responses;
