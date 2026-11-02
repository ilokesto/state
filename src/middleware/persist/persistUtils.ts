import { PersistError } from './Persist.js';
import type { MigrationFn, PersistDecoder } from './Persist.js';

/**
 * @description Validates a persisted state envelope, applies migrations starting
 * at its version, and decodes the resulting state. Returns null only when the
 * payload is null. Valid versions are safe integers from zero through the
 * migration count, inclusive. Validates all required migration steps before
 * running any of them.
 * @param {unknown} payload - Null or an object with own state and version fields.
 * @param {PersistDecoder<State>} decode - Converts the migrated value into State;
 * returning null rejects the stored state.
 * @param {readonly MigrationFn[]} migrations - Ordered migration steps; index n
 * upgrades state from version n to version n + 1.
 * @returns {{ readonly state: State; readonly migrated: boolean } | null}
 * Decoded state and migration status, or null when no payload was supplied.
 * - state `State` - The decoded state after all required migrations.
 * - migrated `boolean` - Whether the stored version was below the migration count.
 * @throws {PersistError} If the envelope or required migration chain is invalid,
 * or the decoder returns null; uses operation 'hydrate' and code 'INVALID_DATA'.
 * Errors thrown by migrations or the decoder propagate unchanged.
 * @example
 * ```ts
 * const result = decodePersisted<{ count: number }>(
 *   { state: 4, version: 0 },
 *   value =>
 *     typeof value === 'object' && value !== null &&
 *     'count' in value && typeof value.count === 'number'
 *       ? { count: value.count }
 *       : null,
 *   [value => ({ count: value })],
 * );
 * // result is { state: { count: 4 }, migrated: true }.
 * ```
 */
export function decodePersisted<State>(
  payload: unknown,
  decode: PersistDecoder<State>,
  migrations: readonly MigrationFn[],
): { readonly state: State; readonly migrated: boolean } | null {
  if (payload === null) return null;
  if (
    typeof payload !== 'object' || Array.isArray(payload) ||
    !Object.hasOwn(payload, 'state') || !Object.hasOwn(payload, 'version') ||
    !('state' in payload) || !('version' in payload) ||
    typeof payload.version !== 'number' || !Number.isSafeInteger(payload.version) ||
    payload.version < 0 || payload.version > migrations.length
  ) {
    throw new PersistError('hydrate', 'INVALID_DATA', 'Invalid persisted state envelope or version');
  }

  const steps: MigrationFn[] = [];
  for (let index = payload.version; index < migrations.length; index += 1) {
    const step = migrations[index];
    if (!Object.hasOwn(migrations, index) || typeof step !== 'function') {
      throw new PersistError('hydrate', 'INVALID_DATA', 'Invalid persistence migration chain');
    }
    steps.push(step);
  }
  let candidate = payload.state;
  for (const step of steps) candidate = step(candidate);
  const state = decode(candidate);
  if (state === null) {
    throw new PersistError('hydrate', 'INVALID_DATA', 'Persist decoder rejected the stored state');
  }
  return { state, migrated: payload.version < migrations.length };
}
