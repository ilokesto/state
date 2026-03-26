import { Store } from '@ilokesto/store';
import { getStore } from '../../lib/getStoreFromProps';
import { MigrationFn, PersistConfig } from '../../types/Persist';
import type { ActionStore, NextState, StoreInput } from '../shared';
import { getStorage, parseOptions, setStorage } from './persistUtils';

const applyPersist = <T, P extends Array<MigrationFn>>(
  initialState: StoreInput<T>,
  options: PersistConfig<T, P>,
): Store<T> => {
  const store = getStore(initialState) as ActionStore<T>;
  const baseSetState = store.setState.bind(store);
  const optionObj = parseOptions(options);
  const initialValue = optionObj.storageType
    ? getStorage({ ...optionObj, initState: store.getState() as T }).state
    : (store.getState() as T);

  baseSetState(initialValue);
  let prevPersistedState = initialValue;

  const setState = (nextState: NextState<T>, actionName?: string) => {
    baseSetState(nextState, actionName);

    if (optionObj.storageType) {
      const currentState = store.getState() as T;

      if (!Object.is(prevPersistedState, currentState)) {
        setStorage({ ...optionObj, value: currentState });
        prevPersistedState = currentState;
      }
    }
  };

  store.setState = setState;

  return store;
};

export function persist<T, P extends Array<MigrationFn>>(
  initialState: StoreInput<T>,
  options: PersistConfig<T, P>,
): Store<T>;
export function persist<P extends Array<MigrationFn>>(
  options: PersistConfig<unknown, P>,
): <T>(initialState: StoreInput<T>) => Store<T>;
export function persist<T, P extends Array<MigrationFn>>(
  first: StoreInput<T> | PersistConfig<unknown, P>,
  second?: PersistConfig<T, P>,
) {
  if (arguments.length === 1) {
    const options = first as PersistConfig<unknown, P>;

    return <State>(initialState: StoreInput<State>) =>
      applyPersist<State, P>(initialState, options as PersistConfig<State, P>);
  }

  return applyPersist(first as StoreInput<T>, second as PersistConfig<T, P>);
}
