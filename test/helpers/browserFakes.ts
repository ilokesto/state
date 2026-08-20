export type DevtoolsMessage = {
  readonly payload?: {
    readonly type?: string;
  };
  readonly state?: string;
  readonly type: string;
};

export type FakeDevtoolsConnection<State> = {
  readonly inits: State[];
  listener: ((message: DevtoolsMessage) => void) | undefined;
  readonly name: string;
  readonly sends: Array<{ readonly action: string; readonly state: State }>;
};

export class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  reads = 0;
  writes = 0;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    this.reads += 1;
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.values.set(key, value);
  }
}

export class MemoryCookieDocument {
  readonly values = new Map<string, string>();
  reads = 0;
  writes = 0;

  get cookie(): string {
    this.reads += 1;
    return [...this.values].map(([key, value]) => `${key}=${value}`).join('; ');
  }

  set cookie(encodedCookie: string) {
    this.writes += 1;
    // Real browsers parse cookie attributes (path, max-age, expires, etc.)
    // and store only the name=value pair. The first segment before `; `
    // is the pair; the rest are attributes we discard.
    const pair = encodedCookie.split(';')[0] ?? '';
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex < 0) return;

    this.values.set(
      pair.slice(0, separatorIndex),
      pair.slice(separatorIndex + 1),
    );
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

export type BrowserStorageFakes = {
  readonly cookieDocument: MemoryCookieDocument;
  readonly localStorage: MemoryStorage;
  readonly sessionStorage: MemoryStorage;
};

export function restoreBrowserGlobal(
  name: 'document' | 'localStorage' | 'sessionStorage' | 'window',
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(globalThis, name);
    return;
  }

  Object.defineProperty(globalThis, name, descriptor);
}

export function withBrowserFakes<State>(
  action: (
    storage: MemoryStorage,
    connections: FakeDevtoolsConnection<State>[],
    browserStorage: BrowserStorageFakes,
  ) => void,
): void {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const cookieDocument = new MemoryCookieDocument();
  const connections: FakeDevtoolsConnection<State>[] = [];
  let hasFakeWindow = false;

  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: sessionStorage,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: cookieDocument,
    });
    try {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
          __REDUX_DEVTOOLS_EXTENSION__: {
            connect: ({ name }: { readonly name: string }) => {
              const connection: FakeDevtoolsConnection<State> = {
                inits: [],
                listener: undefined,
                name,
                sends: [],
              };
              connections.push(connection);

              return {
                init: (state: Readonly<State>) => connection.inits.push({ ...state }),
                send: (actionType: string, state: Readonly<State>) =>
                  connection.sends.push({ action: actionType, state: { ...state } }),
                subscribe: (listener: (message: DevtoolsMessage) => void) => {
                  connection.listener = listener;
                },
              };
            },
          },
        },
      });
      hasFakeWindow = true;
      action(storage, connections, {
        cookieDocument,
        localStorage: storage,
        sessionStorage,
      });
    } finally {
      if (hasFakeWindow) {
        restoreBrowserGlobal('window', windowDescriptor);
      }
    }
  } finally {
    restoreBrowserGlobal('document', documentDescriptor);
    restoreBrowserGlobal('localStorage', localStorageDescriptor);
    restoreBrowserGlobal('sessionStorage', sessionStorageDescriptor);
  }
}
