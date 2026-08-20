/**
 * Identity function — returns its argument unchanged.
 *
 * Used as the default selector when no projection is supplied.
 */
export const identity = <Value>(value: Value): Value => value;