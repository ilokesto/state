import { PersistError } from './Persist.js';
import type { MigrationFn, PersistDecoder } from './Persist.js';

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
