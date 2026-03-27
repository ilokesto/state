import { Store } from '@ilokesto/store';
import { SetStateAction } from 'react';
import { getStore } from '../lib/getStore';

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

const applyValidate = <T>(initialState: T | Store<T>, schema: StandardSchemaV1<T, T>): Store<T> => {
  const store = getStore(initialState);

  store.pushMiddleware((nextState: SetStateAction<T>, next) => {
    const resolvedState =
      typeof nextState === 'function'
        ? (nextState as (prev: Readonly<T>) => T)(store.getState() as T)
        : nextState;

    const result = schema['~standard'].validate(resolvedState);

    if (isPromiseLike(result)) {
      console.error(
        '[Validation Error] Async Standard Schema is not supported in validate middleware.',
      );
      return;
    }

    if ('issues' in result) {
      console.error('[Validation Error] Invalid state:', result.issues);
      return;
    }

    next(result.value);
  });

  return store;
};

export function validate<T>(initialState: T | Store<T>, schema: StandardSchemaV1<T, T>): Store<T>;
export function validate<T>(
  schema: StandardSchemaV1<T, T>,
): (initialState: T | Store<T>) => Store<T>;
export function validate<T>(
  first: T | Store<T> | StandardSchemaV1<T, T>,
  second?: StandardSchemaV1<T, T>,
) {
  if (arguments.length === 1) {
    const schema = first as StandardSchemaV1<T, T>;

    return (initialState: T | Store<T>) => applyValidate(initialState, schema);
  }

  return applyValidate(first as T | Store<T>, second as StandardSchemaV1<T, T>);
}
