import { Store } from '@ilokesto/store';

export type StoreInput<T> = T | Store<T>;

export type NextState<T> = T | ((prevState: Readonly<T>) => T);

export type ActionStore<T> = Store<T> & {
  setState: (nextState: NextState<T>, actionName?: string) => void;
};

export type PipeMiddleware<T> = (store: Store<T>) => Store<T>;
