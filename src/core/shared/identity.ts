/**
 * @description Returns its argument unchanged. Used as the default selector when
 * no projection is supplied.
 * @param {Value} value - Value to return without transformation or copying.
 * @returns {Value} The supplied value, preserving reference identity for objects.
 * @example
 * ```ts
 * const state = { count: 1 };
 * const selected = identity(state);
 * console.assert(selected === state);
 * ```
 */
export const identity = <Value>(value: Value): Value => value;
