import { MigrationFn, PersistConfig, PersistUtils } from '../../types/Persist';

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
  if (!migrate) return;
  let flag = true;

  if (storageType === 'local') {
    while (flag) {
      const { state, version }: { state: any; version: number } = JSON.parse(
        localStorage.getItem(storageKey)!,
      );

      // 상태 버전이 신규 버전보다 낮을 경우 마이그레이션 실행
      if (version < migrate.length) {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            // @ts-expect-error
            state: migrate[version](state),
            version: version + 1,
          }),
        );
      } else {
        flag = false;
        break;
      }
    }
  } else if (storageType === 'cookie') {
    while (flag) {
      const { state, version }: { state: any; version: number } = JSON.parse(
        getCookie(storageKey)!,
      );

      // 상태 버전이 신규 버전보다 낮을 경우 마이그레이션 실행
      if (version < migrate.length) {
        document.cookie = `${storageKey}=${JSON.stringify({
          // @ts-expect-error
          state: migrate[version](state),
          version: version + 1,
        })}`;
      }
    }
  }
};

export const getStorage: PersistUtils['getStorage'] = ({
  storageKey,
  storageType,
  migrate,
  initState,
}) => {
  try {
    let storedValue: string | null = null;

    migrate && storageType && execMigrate({ storageKey, storageType, migrate });

    if (storageType === 'local') {
      storedValue = localStorage.getItem(storageKey);
    } else if (storageType === 'session') {
      storedValue = sessionStorage.getItem(storageKey);
    } else if (storageType === 'cookie') {
      storedValue = getCookie(storageKey);
    }

    if (storedValue !== null) {
      return JSON.parse(storedValue);
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
  try {
    if (storageType === 'local') {
      localStorage.setItem(storageKey, encodedState);
    } else if (storageType === 'session') {
      sessionStorage.setItem(storageKey, encodedState);
    } else if (storageType === 'cookie') {
      document.cookie = `${storageKey}=${encodedState}`;
    }
  } catch (e) {
    if (typeof window !== 'undefined') console.error('Caro-Kann : Failed to write to storage', e);
  }
};
