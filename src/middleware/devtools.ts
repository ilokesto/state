import { Store } from '@ilokesto/store';
import { getStoreActionMetadata } from '../lib/actionMetadata.js';
import { getStore } from '../lib/getStore.js';
import { registerStoreCleanup } from '../lib/storeCleanup.js';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeAnyMiddleware, PipeMiddlewareMetadata } from '../utils/pipe/types.js';

type StoreSetStateAction<T> = Parameters<Store<T>['setState']>[0];

type CurriedDevtools = PipeableMiddleware<
  PipeAnyMiddleware,
  PipeMiddlewareMetadata<'@ilokesto/state/devtools', readonly [], readonly [], 'reject', readonly []>
>;

type DevtoolsMessage = {
  type: string;
  payload?: {
    type?: string;
  };
  state?: string;
};

type DevtoolsConnection<T> = {
  init: (state: Readonly<T>) => void;
  subscribe: (listener: (message: DevtoolsMessage) => void) => (() => void) | undefined;
  send: (action: string, state: Readonly<T>) => void;
};

type ReduxDevtoolsExtension = {
  connect: <T>(options: { name: string }) => DevtoolsConnection<T>;
};

const getDevtoolsExtension = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return (window as Window & { __REDUX_DEVTOOLS_EXTENSION__?: ReduxDevtoolsExtension })
    .__REDUX_DEVTOOLS_EXTENSION__;
};

const applyDevtools = <T>(initialState: T | Store<T>, name: string) => {
  const store = getStore(initialState);
  const isProduction = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
  const devTools = !isProduction && getDevtoolsExtension()?.connect<T>({ name });

  let isDispatchAction = false;

  if (devTools) {
    devTools.init(store.getState() as T);

    const unsubscribe = devTools.subscribe((message) => {
      if (message.type !== 'DISPATCH') {
        return;
      }

      switch (message.payload?.type) {
        case 'RESET':
          isDispatchAction = true;
          store.setState(
            initialState instanceof Store
              ? (initialState.getInitialState() as T)
              : (initialState as T),
          );
          isDispatchAction = false;
          devTools.init(store.getState() as T);
          break;
        case 'COMMIT':
          devTools.init(store.getState() as T);
          break;
        case 'ROLLBACK':
          if (typeof message.state === 'string') {
            isDispatchAction = true;
            store.setState(JSON.parse(message.state) as T);
            isDispatchAction = false;
          }
          break;
        default:
          break;
      }
    });

    if (unsubscribe) {
      registerStoreCleanup(store, unsubscribe);
    }
  }

  store.pushMiddleware((nextState: StoreSetStateAction<T>, next) => {
    next(nextState);

    if (!isProduction && devTools && !isDispatchAction) {
      try {
        const actionType = getStoreActionMetadata(store)?.type ?? 'anonymous action';
        devTools.send(`${name}:${actionType}`, store.getState());
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        console.error('Error sending state to devtools', normalizedError);
      }
    }
  });

  return store;
};

/**
 * Create a pipe middleware that connects the store to the Redux DevTools
 * browser extension.
 *
 * Supports `RESET`, `COMMIT`, and `ROLLBACK` dispatch messages from the
 * DevTools UI. Automatically disabled in production
 * (`NODE_ENV === 'production'`).
 *
 * @param name - Label shown in the DevTools extension.
 * @returns Pipe middleware registered with `@ilokesto/state/devtools` metadata.
 *
 * @example
 * ```ts
 * import { devtools } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const store = pipe.use(devtools('counter')).create({ count: 0 });
 * ```
 */
export function devtools(name: string): CurriedDevtools {
  return definePipeableMiddleware(
    <State>(initialState: State | Store<State>) => applyDevtools(initialState, name),
    {
      adds: [],
      after: [],
      before: [],
      conflicts: [],
      duplicate: 'reject',
      id: '@ilokesto/state/devtools',
      requires: [],
    } as const,
  );
}
