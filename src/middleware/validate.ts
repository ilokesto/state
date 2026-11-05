import type { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStore.js';
import { registerStateValidation } from '../lib/stateValidation.js';
import { definePipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeableMiddleware } from '../utils/pipe/metadata.js';
import type { PipeMiddleware, PipeMiddlewareMetadata } from '../utils/pipe/types.js';

type StoreSetStateAction<T> = Parameters<Store<T>['setState']>[0];

type StandardSchemaIssue = {
  /** Human-readable explanation of the validation failure. */
  readonly message: string;
  /** Schema-provided path identifying the invalid value, when available. */
  readonly path?: ReadonlyArray<unknown>;
};

type StandardSchemaResult<T> =
  | {
      /** Successfully validated output, including any schema transformations. */
      readonly value: T;
    }
  | {
      /** Issues explaining why validation failed. */
      readonly issues: ReadonlyArray<StandardSchemaIssue>;
    };

type StandardSchemaV1<Input = unknown, Output = Input> = {
  /** Standard Schema protocol metadata and validation entry point. */
  readonly '~standard': {
    /** Supported Standard Schema protocol version. */
    readonly version: 1;
    /** Name of the library providing the schema. */
    readonly vendor: string;
    /**
     * Validates an unknown value and returns transformed output or issues.
     * The protocol permits promises, but this middleware rejects async results.
     */
    readonly validate: (
      value: unknown,
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    /** Optional type-level information describing the schema's input and output. */
    readonly types?: {
      /** Input accepted by the schema. */
      readonly input: Input;
      /** Output produced after successful validation and transformation. */
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
   * @param {ReadonlyArray<StandardSchemaIssue>} issues - The validation issues returned by the schema, or a
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

  const validateCandidate = (resolvedState: T): StandardSchemaResult<T> => {
    const result = schema['~standard'].validate(resolvedState);

    if (isPromiseLike(result)) {
      // Observe unsupported async failures before onError can throw synchronously.
      void Promise.resolve(result).catch(() => undefined);
      const issues = [{ message: 'Async Standard Schema is not supported in validate middleware.' }];
      onError(issues);
      return { issues };
    }

    if ('issues' in result) {
      onError(result.issues);
      return result;
    }
    return result;
  };
  registerStateValidation(store, validateCandidate);

  store.pushMiddleware((nextState: StoreSetStateAction<T>, next) => {
    const resolvedState =
      typeof nextState === 'function'
        ? (nextState as (prev: Readonly<T>) => T)(store.getState() as T)
        : nextState;
    const result = validateCandidate(resolvedState);
    if ('value' in result) next(() => result.value);
  });

  return store;
};

/**
 * @description Creates pipe middleware that validates proposed state updates
 * with a Standard Schema v1 validator before accepting them. Functional updates
 * are resolved against the current state before validation; successful updates
 * use the schema's output, including transformations. The middleware also
 * registers the validator with the store's state-validation infrastructure.
 *
 * Only synchronous schemas are supported. Validation failures and promise
 * results call `onError` and drop the update, preserving the previous state.
 * Promise results produce a synthetic validation issue; their eventual rejection
 * is observed without applying state or calling `onError` again. The default handler
 * logs issues with `console.error`; throwing from a handler propagates the
 * exception and aborts the surrounding `setState` call.
 *
 * @param {Schema} schema - Standard Schema v1 validator, such as a Zod or
 * Valibot schema. Its successful output determines the middleware's state type.
 * @param {ValidateOptions | undefined} [options] - Validation error handling.
 * @param {((issues: ReadonlyArray<StandardSchemaIssue>) => void) | undefined} [options.onError] -
 * Receives validation issues or the synthetic unsupported-async issue.
 * Defaults to logging; throw to make rejected updates fail at the call site.
 * @returns {ValidatePipeMiddleware<StandardSchemaState<Schema>>} Callable
 * middleware that installs validation on a store and returns that store.
 * Its pipe metadata identifies `@ilokesto/state/validate` and rejects duplicate
 * installation.
 * - pipeMiddlewareMetadataBrand `ValidationMetadata` - Type-level pipe metadata; `ValidationMetadata` denotes `PipeMiddlewareMetadata<'@ilokesto/state/validate', readonly [], readonly [], 'reject', readonly []>`.
 * : pipeMiddlewareMetadataBrand.adds `ValidationMetadata['adds']` - Capabilities contributed to the pipe, as represented by the metadata type.
 * : pipeMiddlewareMetadataBrand.after `ValidationMetadata['after']` - Ordering constraints requiring this middleware to follow others.
 * : pipeMiddlewareMetadataBrand.before `ValidationMetadata['before']` - Ordering constraints requiring this middleware to precede others.
 * : pipeMiddlewareMetadataBrand.conflicts `ValidationMetadata['conflicts']` - Declared conflicting middleware identifiers; this middleware declares none.
 * : pipeMiddlewareMetadataBrand.duplicate `ValidationMetadata['duplicate']` - Duplicate policy, set to `'reject'`.
 * : pipeMiddlewareMetadataBrand.id `ValidationMetadata['id']` - Middleware identifier, `'@ilokesto/state/validate'`.
 * : pipeMiddlewareMetadataBrand.requires `ValidationMetadata['requires']` - Capabilities required by this middleware's pipe metadata.
 * - pipeStateMismatchKindBrand `ValidationStateMismatchMarker` - Type-level state compatibility marker; `ValidationStateMismatchMarker` denotes the property type of this brand on `ValidatePipeMiddleware<StandardSchemaState<Schema>>`.
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { validate } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const schema = z.object({ count: z.number().int().nonnegative() });
 * const store = pipe
 *   .use(validate(schema, {
 *     onError: (issues) => {
 *       throw new Error(issues[0]?.message ?? 'Invalid state');
 *     },
 *   }))
 *   .create({ count: 0 });
 *
 * store.setState({ count: 1 });
 * try {
 *   store.setState({ count: -1 });
 * } catch (error) {
 *   console.error(error);
 * }
 * // The rejected update leaves the state at { count: 1 }.
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
