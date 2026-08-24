/**
 * A state snapshot that preserves callable types exactly.
 *
 * `Readonly<T>` erases call signatures. TypeScript cannot map arbitrary
 * generic or overloaded call signatures while preserving them, so callable
 * state remains `T`, including its declared own-property modifiers.
 */
type FunctionLike =
  | ((...arguments_: never[]) => unknown)
  | (abstract new (...arguments_: never[]) => unknown);

export type ReadonlySnapshot<T> = T extends FunctionLike ? T : Readonly<T>;

export function readonlySnapshot<T>(state: Readonly<T>): ReadonlySnapshot<T> {
  return state as ReadonlySnapshot<T>;
}
