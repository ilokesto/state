import type { Store } from '@ilokesto/store';

type ValidationResult<State> =
  | { readonly value: State }
  | { readonly issues: readonly unknown[] };

const validators = new WeakMap<object, (value: unknown) => ValidationResult<unknown>>();

export function registerStateValidation<State>(
  store: Store<State>,
  validate: (value: State) => ValidationResult<State>,
): void {
  validators.set(store, (value) => validate(value as State));
}

export function validateState<State>(store: Store<State>, value: State): ValidationResult<State> {
  const validate = validators.get(store);
  return validate ? validate(value) as ValidationResult<State> : { value };
}
