# @ilokesto/state

## 2.0.0

### Major Changes

- 4e99628: ### Breaking change: React adapter selector comparison switched from deep to shallow

  The React adapter's `useStoreState` now compares selector results with a 1-level shallow comparison (`shallow`, zustand-style) instead of recursive deep comparison (`deepCompare`).

  #### What changed

  - Added `src/core/shared/shallow.ts`: zustand-style shallow comparison covering `Object.is`, `Map` (entries), `Set` (iterator), arrays, plain objects, and `Date` (`getTime()`). Circular-reference safe by design (1-level only).
  - `src/core/React/createUseState.ts`: `deepCompare` removed; `shallow` is now baked into `useStoreState` and always applied. `getSnapshot` and `getServerSnapshot` use separate `createShallowSelector` instances so the cached `prev` snapshot is correctly invalidated when the store or selector identity changes (fixes stale-closure issues during SSR hydration).
  - Removed `src/core/shared/deepCompare.ts`.

  #### Why

  - Deep comparison ran on every render and recursively traversed the whole state; shallow checks one level only.
  - The previous `deepCompare` mishandled `Map`, `Set`, and `Date`, and could stack-overflow on circular references.
  - Aligns with zustand v5's standard shallow-compare pattern.

  #### Migration

  - `useStore(s => s.count)` and `useStore(s => ({ a: s.a, b: s.b }))` keep working — the latter now compares first-level values instead of recursing.
  - Selectors that return **nested objects** are now compared by reference (`Object.is`). If you need stable equality for a derived nested object, memoize the selector result with `useMemo`, or return a primitive (e.g. `useStore(s => s.date.getTime())`).
  - Inline selectors re-create identity every render, which resets `createShallowSelector`'s cache and defeats the optimization. Define selectors at module scope or wrap them in `useCallback`.

  Test coverage: `test/shallow.test.ts` (21 cases) covers primitives, objects, arrays, `Map`, `Set`, `Date`, prototype guards, and circular-reference safety.

### Patch Changes

- 5eeec6e: Introduce Changesets for automated versioning and changelog management
