import type { MigrationFn, PersistDecoder, PersistUtils } from './Persist.js';

type PersistedPayload<T> = { state: T; version: number };
type SafeStorageResult<State> =
  | { readonly kind: 'empty'; readonly state: State; readonly version: number }
  | { readonly kind: 'failed'; readonly error: unknown; readonly state: State; readonly version: number }
  | { readonly kind: 'hydrated'; readonly state: State; readonly version: number };
type SafeStorageOptions<State> = PersistUtils['common'] & {
  readonly decode: PersistDecoder<State>;
  readonly initState: State;
  readonly migrate?: readonly MigrationFn[];
};
type PersistOptions<Steps extends readonly MigrationFn[]> = {
  readonly cookie?: string;
  readonly local?: string;
  readonly migrate?: Steps;
  readonly session?: string;
};
const storageWriteCache = new Map<string, string>();

class PersistHydrationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'PersistHydrationError';
  }
}

const getStorageCacheKey = (
  storageType: PersistUtils['common']['storageType'],
  storageKey: string,
) => `${storageType ?? 'none'}:${storageKey}`;

const readStorageValue = (
  storageType: PersistUtils['common']['storageType'],
  storageKey: string,
): string | null => {
  if (typeof window === 'undefined') return null;

  if (storageType === 'local') {
    return localStorage.getItem(storageKey);
  }

  if (storageType === 'session') {
    return sessionStorage.getItem(storageKey);
  }

  if (storageType === 'cookie') {
    return getCookie(storageKey);
  }

  return null;
};

const cacheStoredValue = (
  storageType: PersistUtils['common']['storageType'],
  storageKey: string,
  storedValue: string | null,
) => {
  if (storedValue !== null && storageType) {
    storageWriteCache.set(getStorageCacheKey(storageType, storageKey), storedValue);
  }
};

const hasOwn = <Key extends PropertyKey>(
  value: object,
  key: Key,
): value is Record<Key, unknown> => Object.hasOwn(value, key);

const parseSafePersistedPayload = (parsed: unknown): PersistedPayload<unknown> => {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new PersistHydrationError('Persisted value must be an object');
  }
  if (!hasOwn(parsed, 'state') || !hasOwn(parsed, 'version')) {
    throw new PersistHydrationError('Persisted value must contain state and version');
  }
  if (
    typeof parsed.version !== 'number' ||
    !Number.isFinite(parsed.version) ||
    !Number.isInteger(parsed.version) ||
    parsed.version < 0
  ) {
    throw new PersistHydrationError('Persisted version must be a non-negative integer');
  }

  return { state: parsed.state, version: parsed.version };
};

const readSafePersistedPayload = (
  storageType: PersistUtils['common']['storageType'],
  storageKey: string,
): PersistedPayload<unknown> | null => {
  const storedValue = readStorageValue(storageType, storageKey);
  cacheStoredValue(storageType, storageKey, storedValue);
  if (storedValue === null) return null;

  return parseSafePersistedPayload(JSON.parse(storedValue));
};

const migrateSafeCandidate = (
  payload: PersistedPayload<unknown>,
  migrations: readonly MigrationFn[],
): { readonly candidate: unknown; readonly migrated: boolean } => {
  if (payload.version > migrations.length) {
    throw new PersistHydrationError('Persisted version is newer than the configured migrations');
  }

  const requiredMigrations: MigrationFn[] = [];
  for (let index = payload.version; index < migrations.length; index += 1) {
    if (!Object.hasOwn(migrations, index)) {
      throw new PersistHydrationError('Persist migration chain contains a missing step');
    }
    const migration = migrations[index];
    if (typeof migration !== 'function') {
      throw new PersistHydrationError('Persist migration chain contains a non-function step');
    }
    requiredMigrations.push(migration);
  }

  let candidate = payload.state;
  for (const migration of requiredMigrations) {
    candidate = migration(candidate);
  }

  return { candidate, migrated: payload.version < migrations.length };
};

export function getCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split('; ');
  const cookie = cookies.find((c) => c.startsWith(`${name}=`));
  return cookie ? cookie.split('=')[1] : null;
}

export const getSafeStorage = <State>({
  storageKey,
  storageType,
  migrate = [],
  decode,
  initState,
}: SafeStorageOptions<State>): SafeStorageResult<State> => {
  const fallback = { state: initState, version: migrate.length };

  try {
    const payload = readSafePersistedPayload(storageType, storageKey);
    if (payload === null) return { ...fallback, kind: 'empty' };

    const migrated = migrateSafeCandidate(payload, migrate);

    const decoded = decode(migrated.candidate);
    if (decoded === null) {
      throw new PersistHydrationError('Persist decoder rejected the stored state');
    }

    if (migrated.migrated) {
      setStorage({ storageKey, storageType, storageVersion: migrate.length, value: decoded });
    }

    return { kind: 'hydrated', state: decoded, version: migrate.length };
  } catch (error) {
    return { ...fallback, error, kind: 'failed' };
  }
};

export const parseOptions = <Steps extends readonly MigrationFn[]>(
  StorageConfig?: PersistOptions<Steps>,
) => {
  const storageKey = StorageConfig?.local ?? StorageConfig?.cookie ?? StorageConfig?.session ?? '';
  const storageType = StorageConfig?.local
    ? 'local'
    : StorageConfig?.cookie
      ? 'cookie'
      : StorageConfig?.session
        ? 'session'
        : null;
  const storageVersion = StorageConfig?.migrate?.length ?? 0;
  const migrate = StorageConfig?.migrate;

  return { storageKey, storageType, storageVersion, migrate } as const;
};

export const setStorage: PersistUtils['setStorage'] = ({
  storageKey,
  storageType,
  storageVersion: version,
  value: state,
}) => {
  const encodedState = JSON.stringify({ state, version });
  const cacheKey = getStorageCacheKey(storageType, storageKey);

  if (storageWriteCache.get(cacheKey) === encodedState) return;

  try {
    if (storageType === 'local') {
      localStorage.setItem(storageKey, encodedState);
    } else if (storageType === 'session') {
      sessionStorage.setItem(storageKey, encodedState);
    } else if (storageType === 'cookie') {
      document.cookie = `${storageKey}=${encodedState}`;
    }

    storageWriteCache.set(cacheKey, encodedState);
  } catch (error) {
    if (typeof window !== 'undefined') {
      console.error('Caro-Kann : Failed to write to storage', error);
    }
  }
};
