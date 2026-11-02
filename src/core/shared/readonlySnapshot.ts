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

/**
 * @description Returns the same state value typed as a readonly snapshot.
 * This does not clone or freeze the value. Callable and constructable state
 * preserves its original type, including declared own-property modifiers.
 * @param {Readonly<T>} state - State value to expose as a typed snapshot.
 * @returns {ReadonlySnapshot<T>} The original state value, with callable types
 * preserved and other types exposed through `Readonly<T>`.
 * @example
 * ```ts
 * const state = { count: 1 };
 * const snapshot = readonlySnapshot(state);
 * console.log(snapshot.count); // 1
 * console.log(snapshot === state); // true
 * // snapshot.count = 2; // TypeScript rejects this readonly assignment.
 * ```
 */
export function readonlySnapshot<T>(state: Readonly<T>): ReadonlySnapshot<T> {
  return state as ReadonlySnapshot<T>;
}
