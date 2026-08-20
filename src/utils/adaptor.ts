import { Draft, produce } from 'immer';

// Constrain to objects so immer drafts only apply to reference types
/**
 * Create an immer-based immutable updater for object state.
 *
 * Wraps a mutate function so it operates on a draft and returns a new
 * immutable object. Requires the optional `immer` peer dependency.
 *
 * @param fn - A function that mutates the immer draft.
 * @returns A function that takes the current state and returns the next state.
 *
 * @example
 * ```ts
 * import { adaptor } from '@ilokesto/state/utils';
 *
 * const increment = adaptor((draft) => { draft.count += 1; });
 * store.setState(increment);
 * ```
 */
export function adaptor<T extends object>(fn: (draft: Draft<T>) => void) {
  return produce<T>(fn);
}
