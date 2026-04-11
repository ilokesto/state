import { MigrationFn, PersistConfig, PersistUtils } from './Persist';

type PersistedPayload<T> = { state: T; version: number };
const storageWriteCache = new Map<string, string>();

const getStorageCacheKey = (
  storageType: PersistUtils['common']['storageType'],
  storageKey: string,
) => `${storageType ?? 'none'}:${storageKey}`;

const readStorageValue = (
  storageType: PersistUtils['common']['storageType'],
  storageKey: string,
): string | null => {
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

const readPersistedPayload = <T>(
  storageType: PersistUtils['common']['storageType'],
  storageKey: string,
): PersistedPayload<T> | null => {
  const storedValue = readStorageValue(storageType, storageKey);

  cacheStoredValue(storageType, storageKey, storedValue);

  return parsePersistedPayload<T>(storedValue);
};

const parsePersistedPayload = <T>(storedValue: string | null): PersistedPayload<T> | null => {
  if (storedValue === null) return null;

  const parsed = JSON.parse(storedValue) as Partial<PersistedPayload<T>>;
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (typeof parsed.version !== 'number' || !Number.isFinite(parsed.version)) return null;
  if (!('state' in parsed)) return null;

  return { state: parsed.state as T, version: parsed.version };
};

export function getCookie(name: string) {
  const cookies = document.cookie.split('; ');
  const cookie = cookies.find((c) => c.startsWith(`${name}=`));
  return cookie ? cookie.split('=')[1] : null;
}

export const execMigrate: PersistUtils['execMigration'] = ({
  storageKey,
  storageType,
  migrate,
}) => {
  if (!migrate || migrate.length === 0) return null;
  if (storageType !== 'local' && storageType !== 'cookie') return null;

  const storedPayload = readPersistedPayload<unknown>(storageType, storageKey);

  if (!storedPayload) return null;

  const initialVersion =
    Number.isInteger(storedPayload.version) && storedPayload.version >= 0
      ? storedPayload.version
      : 0;
  let version = initialVersion;
  let state: unknown = storedPayload.state;
  const migrations = migrate as ReadonlyArray<MigrationFn>;

  while (version < migrations.length) {
    state = migrations[version](state);
    version += 1;
  }

  if (version === initialVersion) {
    return { state: state as typeof storedPayload.state, version };
  }

  const encodedState = JSON.stringify({ state, version });
  if (storageType === 'local') {
    localStorage.setItem(storageKey, encodedState);
  } else {
    document.cookie = `${storageKey}=${encodedState}`;
  }

  storageWriteCache.set(getStorageCacheKey(storageType, storageKey), encodedState);

  return { state: state as typeof storedPayload.state, version };
};

export const getStorage: PersistUtils['getStorage'] = ({
  storageKey,
  storageType,
  migrate,
  initState,
}) => {
  try {
    const shouldUseMigratePath =
      !!migrate && migrate.length > 0 && (storageType === 'local' || storageType === 'cookie');

    if (shouldUseMigratePath) {
      const migratedPayload = execMigrate({ storageKey, storageType, migrate });

      if (migratedPayload) {
        return {
          state: migratedPayload.state as typeof initState,
          version: migratedPayload.version,
        };
      }

      return { state: initState, version: 0 };
    }

    const storedPayload = readPersistedPayload<unknown>(storageType, storageKey);

    if (storedPayload) {
      return { state: storedPayload.state as typeof initState, version: storedPayload.version };
    }
  } catch (e) {
    if (typeof window !== 'undefined') console.error('Caro-Kann : Failed to read from storage');
  }

  return { state: initState, version: 0 };
};

export const parseOptions = <T, P extends Array<MigrationFn>>(
  StorageConfig?: PersistConfig<T, P>,
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
  } catch (e) {
    if (typeof window !== 'undefined') console.error('Caro-Kann : Failed to write to storage', e);
  }
};
