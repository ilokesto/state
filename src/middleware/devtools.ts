import { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStoreFromProps';
import type { ActionStore, NextState, StoreInput } from './shared';

type DevtoolsMessage = {
  type: string;
  payload?: {
    type?: string;
  };
  state?: string;
};

type DevtoolsConnection<T> = {
  init: (state: Readonly<T>) => void;
  subscribe: (listener: (message: DevtoolsMessage) => void) => void;
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

const hasInitialState = <T>(value: StoreInput<T>): value is Store<T> => {
  return typeof value === 'object' && value !== null && 'getInitialState' in value;
};

const applyDevtools = <T>(initialState: StoreInput<T>, name: string) => {
  const store = getStore(initialState) as ActionStore<T>;
  const baseSetState = store.setState.bind(store);
  const isProduction = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
  const devTools = !isProduction && getDevtoolsExtension()?.connect<T>({ name });

  if (devTools) {
    devTools.init(store.getState());

    devTools.subscribe((message) => {
      if (message.type !== 'DISPATCH') {
        return;
      }

      switch (message.payload?.type) {
        case 'RESET':
          baseSetState(hasInitialState(initialState) ? (initialState.getInitialState() as T) : initialState);
          devTools.init(store.getState());
          break;
        case 'COMMIT':
          devTools.init(store.getState());
          break;
        case 'ROLLBACK':
          if (typeof message.state === 'string') {
            baseSetState(JSON.parse(message.state) as T);
          }
          break;
        default:
          break;
      }
    });
  }

  const setState = (nextState: NextState<T>, actionName: string = 'setStateAction') => {
    baseSetState(nextState, actionName);

    if (!isProduction && devTools) {
      try {
        devTools.send(`${name}:${actionName}`, store.getState());
      } catch (error) {
        console.error('Error sending state to devtools', error);
      }
    }
  };

  store.setState = setState;

  return store;
};

export function devtools<T>(initialState: StoreInput<T>, name: string): Store<T>;
export function devtools(name: string): <T>(initialState: StoreInput<T>) => Store<T>;
export function devtools<T>(first: StoreInput<T> | string, second?: string) {
  if (arguments.length === 1) {
    const name = first as string;

    return <State>(initialState: StoreInput<State>) => applyDevtools(initialState, name);
  }

  return applyDevtools(first as StoreInput<T>, second as string);
}
