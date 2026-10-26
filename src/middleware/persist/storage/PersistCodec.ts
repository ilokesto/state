import type { PersistedValue } from './PersistStorage.js';

/** Explicit string serialization boundary for the entire persistence envelope.
 * Decoding still validates the envelope and persisted state after deserialization.
 * @example
 * const codec: PersistCodec = { serialize: JSON.stringify, deserialize: JSON.parse };
 */
export type PersistCodec = {
  /** Owns round-trip handling of Date and other non-JSON values. */
  readonly serialize: (value: PersistedValue) => string;
  /** Returns untrusted data, never a prevalidated state. */
  readonly deserialize: (text: string) => unknown;
};
