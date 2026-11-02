import type { Store } from '@ilokesto/store';

/** The validated value on success, or validation issues on failure. */
type ValidationResult<State> =
  | {
    /** The value accepted or transformed by validation. */
    readonly value: State;
  }
  | {
    /** The issues reported when validation fails. */
    readonly issues: readonly unknown[];
  };

const validators = new WeakMap<object, (value: unknown) => ValidationResult<unknown>>();

/**
 * @description Registers a validator for a store, replacing any previously registered
 * validator. Registration does not run validation or modify the store.
 * @param {Store<State>} store - Store whose identity determines which validator is used.
 * @param {(value: State) => ValidationResult<State>} validate - Validator that returns
 * `{ value }` on success or `{ issues }` on failure.
 * @example
 * ```ts
 * // Given an existing Store<number> named countStore:
 * registerStateValidation(countStore, (value) =>
 *   value >= 0 ? { value } : { issues: ['Count must be nonnegative'] },
 * );
 * const result = validateState(countStore, -1);
 * // result is { issues: ['Count must be nonnegative'] }.
 * ```
 */
export function registerStateValidation<State>(
  store: Store<State>,
  validate: (value: State) => ValidationResult<State>,
): void {
  validators.set(store, (value) => validate(value as State));
}

/**
 * @description Runs the store's registered validator against the supplied value.
 * Without a registered validator, returns the supplied value as a successful result.
 * Does not update the store; exceptions thrown by the validator propagate to the caller.
 * @param {Store<State>} store - Store whose registered validator should be used.
 * @param {State} value - Candidate value to validate.
 * @returns {ValidationResult<State>} The validator's result, or `{ value }` when no
 * validator is registered.
 * - issues `readonly unknown[]` - Validation issues, present in the failure variant.
 * - value `State` - The accepted or transformed value, present in the success variant.
 * @example
 * ```ts
 * // Given an existing Store<number> named countStore:
 * registerStateValidation(countStore, (value) =>
 *   value >= 0 ? { value } : { issues: ['Count must be nonnegative'] },
 * );
 * const result = validateState(countStore, 3);
 * if ('value' in result) {
 *   console.log(result.value); // 3
 * } else {
 *   console.error(result.issues);
 * }
 * ```
 */
export function validateState<State>(store: Store<State>, value: State): ValidationResult<State> {
  const validate = validators.get(store);
  return validate ? validate(value) as ValidationResult<State> : { value };
}
