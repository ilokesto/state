export type MigrationFn = (props: any) => unknown;

type MigrationPipe<P extends Array<MigrationFn>, BeforeFnReturnType = any> = P extends [
  infer First,
  ...infer Rest extends Array<MigrationFn>,
]
  ? First extends (props: infer InferPropsType) => infer InferReturnType
    ? InferPropsType extends BeforeFnReturnType
      ? [First, ...MigrationPipe<Rest, InferReturnType>] extends P
        ? [First, ...MigrationPipe<Rest, InferReturnType>]
        : never
      : never
    : never
  : [];

type Migrate<T, P extends Array<MigrationFn>> = P extends [...infer Rest, infer Last]
  ? Last extends (props: any) => infer LastReturnType
    ? T extends LastReturnType
      ? MigrationPipe<P>
      : never
    : never
  : never;

type StorageConfig<T = unknown, P extends Array<MigrationFn> = Array<MigrationFn>> = {
  local: {
    local: string;
    session?: never;
    cookie?: never;
    migrate?: Migrate<T, P>;
  };
  session: {
    local?: never;
    session: string;
    cookie?: never;
    migrate?: never;
  };
  cookie: {
    local?: never;
    session?: never;
    cookie: string;
    migrate?: Migrate<T, P>;
  };
};

export type PersistConfig<T, P extends Array<MigrationFn>> = StorageConfig<
  T,
  P
>[keyof StorageConfig];

export type PersistUtils = {
  common: {
    storageKey: string;
    storageType: keyof StorageConfig | null;
  };
  getStorage: <T, P extends Array<MigrationFn>>(
    props: PersistUtils['common'] & {
      migrate?: Migrate<T, P>;
      initState: T;
    },
  ) => { state: T; version: number };
  setStorage: <T>(
    props: PersistUtils['common'] & {
      storageVersion: number;
      value: T;
    },
  ) => void;
  execMigration: <T, P extends Array<MigrationFn>>(
    props: PersistUtils['common'] & {
      migrate?: Migrate<T, P>;
    },
  ) => void;
};
