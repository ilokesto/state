import type { MigrationFn, PersistDecoder, PersistUtils } from './Persist.js';

type PersistedPayload<T> = { state: T; version: number };
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

const parseSafePersistedPayload = (parsed: unknown): PersistedPayload<unknown> | null => {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  if (!hasOwn(parsed, 'state') || !hasOwn(parsed, 'version')) return null;
  if (
    typeof parsed.version !== 'number' ||
    !Number.isFinite(parsed.version) ||
    !Number.isInteger(parsed.version) ||
    parsed.version < 0
  ) {
    return null;
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

  try {
    return parseSafePersistedPayload(JSON.parse(storedValue));
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
};

const migrateSafeCandidate = (
  payload: PersistedPayload<unknown>,
  migrations: readonly MigrationFn[],
): { readonly candidate: unknown; readonly migrated: boolean } | null => {
  if (payload.version > migrations.length) return null;

  const requiredMigrations: MigrationFn[] = [];
  for (let index = payload.version; index < migrations.length; index += 1) {
    if (!Object.hasOwn(migrations, index)) return null;
    const migration = migrations[index];
    if (typeof migration !== 'function') return null;
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
}: SafeStorageOptions<State>): { readonly state: State; readonly version: number } => {
  const fallback = { state: initState, version: migrate.length };

  try {
    const payload = readSafePersistedPayload(storageType, storageKey);
    if (payload === null) return fallback;

    const migrated = migrateSafeCandidate(payload, migrate);
    if (migrated === null) return fallback;

    const decoded = decode(migrated.candidate);
    if (decoded === null) return fallback;

    if (migrated.migrated) {
      setStorage({ storageKey, storageType, storageVersion: migrate.length, value: decoded });
    }

    return { state: decoded, version: migrate.length };
  } catch {
    return fallback;
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