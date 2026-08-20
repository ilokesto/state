import type { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStore.js';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeMiddleware, PipeMiddlewareMetadata } from '../utils/pipe/types.js';

type StoreSetStateAction<T> = Parameters<Store<T>['setState']>[0];

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

/**
 * Options for the {@link validate} middleware.
 */
type ValidateOptions = {
  /**
   * Called when validation fails or an async schema is detected.
   *
   * Defaults to `console.error`. Throw inside the callback to propagate the
   * error and abort the surrounding `setState` call; otherwise the update is
   * silently dropped and the store keeps its previous state.
   *
   * @param issues - The validation issues returned by the schema, or a
   *   synthetic issue when an async schema is encountered.
   */
  readonly onError?: (issues: ReadonlyArray<StandardSchemaIssue>) => void;
};

type ValidatePipeMiddleware<T> = PipeableMiddleware<
  PipeMiddleware<T>,
  PipeMiddlewareMetadata<'@ilokesto/state/validate', readonly [], readonly [], 'reject', readonly []>
>;

type StandardSchemaOutput<Result> = Result extends { readonly value: infer Output } ? Output : never;

type StandardSchemaState<Schema extends StandardSchemaV1> = StandardSchemaOutput<
  Awaited<ReturnType<Schema['~standard']['validate']>>
>;

const isPromiseLike = <T>(value: T | Promise<T>): value is Promise<T> => {
  return typeof value === 'object' && value !== null && 'then' in value;
};

const defaultOnError = (issues: ReadonlyArray<StandardSchemaIssue>): void => {
  console.error('[Validation Error] Invalid state:', issues);
};

const applyValidate = <T>(
  initialState: T | Store<T>,
  schema: StandardSchemaV1<T, T>,
  onError: (issues: ReadonlyArray<StandardSchemaIssue>) => void,
): Store<T> => {
  const store = getStore(initialState);

  store.pushMiddleware((nextState: StoreSetStateAction<T>, next) => {
    const resolvedState =
      typeof nextState === 'function'
        ? (nextState as (prev: Readonly<T>) => T)(store.getState() as T)
        : nextState;

    const result = schema['~standard'].validate(resolvedState);

    if (isPromiseLike(result)) {
      onError([
        {
          message: 'Async Standard Schema is not supported in validate middleware.',
        },
      ]);
      return;
    }

    if ('issues' in result) {
      onError(result.issues);
      return;
    }

    next(result.value);
  });

  return store;
};

/**
 * Create a pipe middleware that validates state updates with a Standard
 * Schema v1 validator before the store accepts them.
 *
 * Only synchronous schemas are supported. If validation fails, the update is
 * dropped and `onError` is called (defaults to `console.error`). Throw inside
 * `onError` to propagate the error to the caller of `setState`.
 *
 * @param schema - A Standard Schema v1 compliant schema (Zod, Valibot, etc.).
 * @param options - Optional configuration.
 * @param options.onError - Custom error handler. Defaults to `console.error`.
 * @returns Pipe middleware registered with `@ilokesto/state/validate` metadata.
 *
 * @example
 * ```ts
 * import { validate } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const store = pipe
 *   .use(validate(schema, { onError: (issues) => { throw new Error(issues[0]?.message); } }))
 *   .create({ count: 0 });
 * ```
 */
export function validate<Schema extends StandardSchemaV1>(
  schema: Schema,
  options?: ValidateOptions,
): ValidatePipeMiddleware<StandardSchemaState<Schema>> {
  const onError = options?.onError ?? defaultOnError;
  const middleware: PipeMiddleware<StandardSchemaState<Schema>> = (store) =>
    applyValidate(
      store,
      schema as StandardSchemaV1<StandardSchemaState<Schema>, StandardSchemaState<Schema>>,
      onError,
    );

  return definePipeableMiddleware(middleware, {
    conflicts: [],
    duplicate: 'reject',
    id: '@ilokesto/state/validate',
  } as const);
}
