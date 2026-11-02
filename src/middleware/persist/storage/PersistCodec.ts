import type { PersistedValue } from './PersistStorage.js';

/**
 * @description Defines the string serialization boundary for the entire persistence
 * envelope. Decoding still validates the envelope and persisted state after
 * deserialization.
 * @example
 * ```ts
 * const codec: PersistCodec = {
 *   serialize: JSON.stringify,
 *   deserialize: JSON.parse,
 * };
 * ```
 */
export type PersistCodec = {
  /**
   * Converts the entire persistence envelope to its stored string representation.
   * Owns round-trip handling of Date and other non-JSON values together with
   * deserialize; JSON serialization alone does not preserve those types.
   */
  readonly serialize: (value: PersistedValue) => string;
  /**
   * Converts a stored string back to an untrusted value for subsequent envelope
   * and persisted-state validation. Returns untrusted data, never a prevalidated
   * state.
   */
  readonly deserialize: (text: string) => unknown;
};
