import { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStoreFromProps';
import type { ActionStore, NextState, StoreInput } from './shared';

type StandardSchemaIssue = {
  readonly message: string;
  readonly path?: ReadonlyArray<unknown>;
};

type StandardSchemaResult<T> =
  | {
      readonly value: T;
    }
  | {
      readonly issues: ReadonlyArray<StandardSchemaIssue>;
    };

type StandardSchemaV1<Input = unknown, Output = Input> = {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    readonly types?: {
      readonly input: Input;
      readonly output: Output;
    };
  };
};

const isPromiseLike = <T>(value: T | Promise<T>): value is Promise<T> => {
  return typeof value === 'object' && value !== null && 'then' in value;
};

const applyValidate = <T>(initialState: StoreInput<T>, schema: StandardSchemaV1<T, T>): Store<T> => {
  const store = getStore(initialState) as ActionStore<T>;
  const baseSetState = store.setState.bind(store);

  const setState = (nextState: NextState<T>, actionName?: string) => {
    const newState =
      typeof nextState === 'function'
        ? (nextState as (prev: Readonly<T>) => T)(store.getState())
        : nextState;

    const result = schema['~standard'].validate(newState);

    if (isPromiseLike(result)) {
      console.error('[Validation Error] Async Standard Schema is not supported in validate middleware.');
      return;
    }

    if ('issues' in result) {
      console.error('[Validation Error] Invalid state:', result.issues);
      return;
    }

    baseSetState(result.value, actionName);
  };

  store.setState = setState;

  return store;
};

export function validate<T>(initialState: StoreInput<T>, schema: StandardSchemaV1<T, T>): Store<T>;
export function validate<T>(schema: StandardSchemaV1<T, T>): (initialState: StoreInput<T>) => Store<T>;
export function validate<T>(first: StoreInput<T> | StandardSchemaV1<T, T>, second?: StandardSchemaV1<T, T>) {
  if (arguments.length === 1) {
    const schema = first as StandardSchemaV1<T, T>;

    return (initialState: StoreInput<T>) => applyValidate(initialState, schema);
  }

  return applyValidate(first as StoreInput<T>, second as StandardSchemaV1<T, T>);
}
