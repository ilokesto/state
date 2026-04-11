import { Store } from '@ilokesto/store';
import { useMemo, useSyncExternalStore } from 'react';

import { deepCompare } from '../shared/deepCompare';

export function useStoreState<T, S>(store: Store<T>, selector: (state: T) => S) {
  const subscribe = useMemo(() => store.subscribe.bind(store), [store]);
  const setState = useMemo(() => store.setState.bind(store), [store]);

  const { getSnapshot, getServerSnapshot } = useMemo(() => {
    let hasMemo = false;
    let mStore: T | undefined;
    let mSelection: S | undefined;

    const mSelector = (nStore: T): S => {
      if (!hasMemo) {
        hasMemo = true;
        mStore = nStore;
        const nSelection = selector(nStore);
        mSelection = nSelection;
        return nSelection;
      }

      const pStore = mStore as T;
      const pSelection = mSelection as S;

      if (deepCompare(pStore, nStore)) return pSelection;

      const nSelection = selector(nStore);

      mStore = nStore;
      mSelection = nSelection;
      return nSelection;
    };

    return {
      getSnapshot: () => mSelector(store.getState()),
      getServerSnapshot: () => mSelector(store.getInitialState()),
    };
  }, [store, selector]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return [value, setState] as const;
}
