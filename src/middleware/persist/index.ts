import { Store } from '@ilokesto/store';
import { getStore } from '../../lib/getStore';
import { MigrationFn, PersistConfig } from './Persist';
import { getStorage, parseOptions, setStorage } from './persistUtils';

const applyPersist = <T, P extends Array<MigrationFn>>(
  initialState: T | Store<T>,
  options: PersistConfig<T, P>,
): Store<T> => {
  const store = getStore(initialState);
  const baseSetState = store.setState.bind(store);
  const optionObj = parseOptions(options);
  const initialValue = optionObj.storageType
    ? getStorage({ ...optionObj, initState: store.getState() as T }).state
    : (store.getState() as T);

  baseSetState(initialValue);

  if (optionObj.storageType) {
    let prevPersistedState = initialValue;

    store.pushMiddleware((nextState, next) => {
      next(nextState);

      const currentState = store.getState() as T;

      if (!Object.is(prevPersistedState, currentState)) {
        setStorage({ ...optionObj, value: currentState });
        prevPersistedState = currentState;
      }
    });
  }

  return store;
};

export function persist<T, P extends Array<MigrationFn>>(
  initialState: T | Store<T>,
  options: PersistConfig<T, P>,
): Store<T>;
export function persist<P extends Array<MigrationFn>>(
  options: PersistConfig<unknown, P>,
): <T>(initialState: T | Store<T>) => Store<T>;
export function persist<T, P extends Array<MigrationFn>>(
  first: T | Store<T> | PersistConfig<unknown, P>,
  second?: PersistConfig<T, P>,
) {
  if (arguments.length === 1) {
    const options = first as PersistConfig<unknown, P>;

    return (initialState: T | Store<T>) =>
      applyPersist<T, P>(initialState, options as PersistConfig<T, P>);
  }

  return applyPersist(first as T | Store<T>, second as PersistConfig<T, P>);
}
