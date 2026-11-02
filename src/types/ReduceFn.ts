/**
 * A discriminated action object with a string `type` field.
 */
export type ReducerAction = {
  /** String discriminator identifying the action handled by the reducer. */
  readonly type: string;
};

/**
 * A reducer function that computes the next state from the current state and an action.
 */
export type ReduceFn<T, Action extends ReducerAction> = (state: T, action: Action) => T;
