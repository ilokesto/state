import { Draft, produce } from 'immer';

// Constrain to objects so immer drafts only apply to reference types
/**
 * @description Creates an Immer-based immutable updater for object state.
 * Wraps a mutation function so it operates on a draft without mutating the
 * original state. Requires the optional `immer` peer dependency.
 *
 * @param {(draft: Draft<T>) => void} fn - Recipe that mutates the Immer draft.
 * @returns {(state?: T | undefined) => T} Curried updater that applies the recipe
 * to the supplied state and returns the next state, preserving the original
 * reference when nothing changes. Although the inferred signature permits
 * omitted state, supply a valid state object when the recipe accesses its fields.
 *
 * @example
 * ```ts
 * import { adaptor } from '@ilokesto/state/adaptor';
 *
 * const increment = adaptor<{ count: number }>((draft) => {
 *   draft.count += 1;
 * });
 * const current = { count: 0 };
 * const next = increment(current);
 * // next.count === 1; current.count === 0
 * ```
 */
export function adaptor<T extends object>(fn: (draft: Draft<T>) => void) {
  return produce<T>(fn);
}
