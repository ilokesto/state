# @ilokesto/state

## 2.0.0

### Major Changes

- dc598b5: Rebuild the shared state foundation with synchronous FIFO commit-snapshot
  notifications, immediate subscription disposal, independent callback registrations,
  and aggregated delivery errors. These are intentional observable changes from
  recursive, fail-fast notification delivery.

  Expose structural ReadableStore and StoreApi contracts, createStore, and explicit
  set/update operations. State now exports framework-neutral construction and
  composition from its root, createReducer handles, and bind/bindReducer entrypoints
  for React, Vue, Solid, Svelte, and Angular. Existing convenience creators share the
  same foundation, and Svelte set now stores callable values without invoking them.
  Reducer results also preserve callable value identity, and handles retain the
  capability types of an explicitly supplied Store.

  Migrate Form, Overlay, and Toast to the new Store construction surface; Modal
  inherits Overlay's updated notification foundation. Preserve framework support,
  middleware ordering, reducer metadata, SSR snapshots, and package capabilities.
  Packed Form verification inherits the root pnpm version so its local Store
  tarball override is honored in isolated consumer projects.

  See the bilingual State advanced migration guide and Store notification semantics.
  Version application and publishing are intentionally left to a later Changesets run.

- 7b19c4d: Preserve `@ilokesto/store`'s `Readonly<T>` contract across the React, Vue, Angular, Svelte, and Solid adapters. Selector inputs, full-state reactive reads, lifecycle-free `readOnly()` results, and Svelte subscriptions expose `Readonly<T>` for object state. Callable state remains exact `T`, preserving arbitrary generic and overloaded signatures; its own-property modifiers remain as declared.

  ### Migration

  Code that mutates object adapter state in a selector, subscription, reactive result, or `readOnly()` result must move that update to the correct writer. Callable state preserves the mutability of its declared own properties.

  For plain state, use an immutable updater through `writeOnly()`, `setState`, or Svelte's `update`:

  ```ts
  counter.writeOnly()((current) => ({ ...current, count: current.count + 1 }));
  ```

  For reducer state, dispatch a typed action. The reducer computes the next state:

  ```ts
  type CounterAction = { readonly type: 'increment' };

  const counter = create(
    (state: { readonly count: number }, action: CounterAction) => {
      switch (action.type) {
        case 'increment':
          return { count: state.count + 1 };
      }
    },
    { count: 0 },
  );

  counter.writeOnly()({ type: 'increment' });
  ```

- c9c06c8: ### Breaking change: React adapter selector comparison switched from deep to shallow

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

- 6bf9a77: ### Breaking change: `adaptor` moved from `@ilokesto/state/utils` to `@ilokesto/state/adaptor`

  `@ilokesto/state/utils` eagerly re-exported `adaptor`, which statically imports `immer`. Because ESM module graphs evaluate eagerly, importing anything from `@ilokesto/state/utils` failed with `ERR_MODULE_NOT_FOUND` for consumers that had not installed the optional `immer` peer. Keeping `adaptor` on `utils` without eager `immer` resolution is impossible in plain ESM without making `adaptor` asynchronous, so `adaptor` now lives on its own subpath.

  #### What changed

  - `@ilokesto/state/utils` no longer exports `adaptor`; it exports only `pipe`, `definePipeableMiddleware`, and pipe types, none of which touch `immer`.
  - New public subpath `@ilokesto/state/adaptor` exports `adaptor` and is the only entry point that resolves `immer`.
  - Added a packed-consumer regression test (`test/utils-import-without-immer.test.ts`) that installs the tarball without `immer` and proves `utils` imports cleanly while `adaptor` fails on `immer` only.

  #### Migration

  ```ts
  // Before
  import { adaptor } from '@ilokesto/state/utils';

  // After
  import { adaptor } from '@ilokesto/state/adaptor';
  ```

  `immer` remains an optional peer dependency: install it only when you use `@ilokesto/state/adaptor`. Consumers of `@ilokesto/state/utils` who never used `adaptor` need no changes; their imports now work without `immer` installed.

### Minor Changes

- 80494ba: ### persist: SSR safety and manual hydration API

  #### What changed

  - `persist` no longer crashes on the server. `readStorageValue` and `getCookie` now return `null` when `window` or `document` is unavailable, so store evaluation is safe in SSR environments (Next.js App Router, Nuxt, etc.).
  - Added `skipHydration` option to all persist config variants (`local`, `cookie`, `session`). When `true`, the store keeps its initial state at creation time instead of eagerly applying the persisted value.
  - Added `store.persist.rehydrate()` to manually trigger hydration from storage. Safe to call once; subsequent calls are no-ops.
  - Added `store.persist.hasHydrated()` to check whether hydration has completed.
  - Added `onRehydrateStorage` option: a factory that receives the current state and returns a callback invoked with the rehydrated state and any error.
  - Eager and manual hydration now share one callback lifecycle. Empty or failed reads preserve the latest live state, hydration errors retain their original identity, and the post callback runs exactly once after `hasHydrated()` becomes `true`.
  - New exported types: `PersistControls`, `PersistStore`, `OnRehydrateStorage`, `OnRehydrateStorageCallback`.
  - `persist` now adds a `@ilokesto/state/persist-controls` capability to the pipe chain.

  #### Why

  - `persist` stores crashed on the server because `localStorage`/`sessionStorage`/`document.cookie` were accessed without an SSR guard.
  - Eager hydration caused React hydration mismatch in SSR frameworks: the server rendered the initial state while the client rendered the persisted value.
  - There was no escape hatch to defer hydration to a client effect, unlike zustand's `skipHydration` + `rehydrate()` pattern.

  #### Migration

  - Existing persist usage (eager hydration) is unchanged — `skipHydration` defaults to `false`.
  - For SSR frameworks like Next.js App Router, pass `skipHydration: true` and call `store.persist.rehydrate()` in a `useEffect`:

    ```ts
    const store = pipe
      .use(persist({ local: 'counter', decode: decodeCounter, skipHydration: true }))
      .create({ count: 0 });

    useEffect(() => {
      store.persist.rehydrate();
    }, []);
    ```

  - The returned store type is now `PersistStore<T>` (extends `Store<T>` with a `persist` property). Existing `Store<T>` annotations still work because `PersistStore<T>` is assignable to `Store<T>`.

- 5d6502f: Export the React adapter's `UseState` and `UseReducer` types from `@ilokesto/state/react`.

  > Migration: No runtime migration is required because this adds type-only exports and leaves JavaScript exports unchanged.

### Patch Changes

- 53d16e2: Correct documentation frontmatter, MDX comments, and table syntax so package-owned content builds in the official monorepo documentation application.
- bb26d48: Point package repository links to the ilokesto organization monorepo and update the fetcher homepage before retiring the legacy repositories.
- 6809a20: Correct the English and Korean middleware documentation to use the builder-only `pipe` API and safe `persist` configuration.
- c9c06c8: Introduce Changesets for automated versioning and changelog management
- a73f7c8: Encode cookie persistence payloads so JSON values containing equals signs and cookie delimiters rehydrate without truncation, while continuing to read legacy raw payloads.
- dc25121: Restore debounce scheduling after a function updater throws during flush.
- 4e0a9b8: Reject invalid `debounce()` wait values before Store or timer setup. Delays must now be finite non-negative milliseconds; `0` remains valid.
- 7729f7c: Preserve public JSDoc in emitted declarations for editor IntelliSense.
- 7797e22: Restore DevTools update reporting after a RESET or ROLLBACK state write fails.
- cdebbb5: Safely reuse an existing Store across reducer adapters by installing one reducer middleware for the same reducer identity and rejecting conflicting reducer registrations before mutation.
- bf20504: Preserve function-valued plain initial state across the React, Vue, Angular, Svelte, and Solid adapters while retaining reducer creation for two-argument calls, including an explicit `undefined` initial state.
- d41199f: Fix logger defaults when options are partial.
- d89d926: Reject `persist` before `debounce` pipe chains so deferred commits are persisted reliably.
- 09ceb7a: Unify plain and reducer selector subscriptions across the React, Vue, Angular, Solid, and Svelte adapters. All adapters now use `Store.subscribeSelector` with shared shallow equality, skip unrelated updates, preserve framework lifecycle cleanup, and retain React's initial-state server snapshot behavior.
- 2a0c717: ### Bug fixes and cleanup

  #### `shallow()` false-positive for RegExp, Error, Promise, and other built-ins

  `shallow()` compared objects with no enumerable own properties (RegExp, Error, Promise, class instances without data fields) via `Object.entries()`, which returns `[]` for these types. Two different references would incorrectly compare as shallow-equal, causing selector subscriptions to skip notifications for states containing these value types.

  - **Fix**: Added a `RegExp` special case (compares `source` and `flags`, matching the existing `Date` pattern). Objects with zero enumerable own properties now fall back to reference equality unless they are plain objects (`Object.prototype` or `null` prototype), preserving the `shallow({}, {}) === true` behavior.
  - **Tests**: 8 new cases in `test/shallow.test.ts`.

  #### `validate` middleware `onError` option

  Validation failures and async schema detection were silently swallowed with only a `console.error`. The `validate` middleware now accepts an optional `onError` callback (defaults to `console.error`). Throw inside `onError` to propagate the error to the caller of `setState`.

  - **Tests**: 3 new cases in `test/pipe-validate.test.ts`.

  #### Other fixes

  - **`debounce` middleware**: replaced `NodeJS.Timeout` with `ReturnType<typeof setTimeout>` for cross-environment type safety.
  - **`persist` cookie writes**: added `path=/` so persisted cookies are visible across all routes.
  - **`persist` error log**: replaced the leftover `Caro-Kann` placeholder with `[@ilokesto/state/persist]`.
  - **`persist` write cache**: removed the unbounded module-level `storageWriteCache` Map. Write deduplication is now per-store-instance via `lastEncodedValue`, eliminating the memory leak for apps with many persisted stores.

  #### Cleanup

  - **`storeCleanup.ts`**: removed the redundant `cleanupEntriesByStore` alias.
  - **`devtools` middleware**: replaced duck-typed `hasInitialState` with `instanceof Store`.
  - **`adaptor.ts`**: translated the Korean inline comment to English.
  - **Adapter dedup**: extracted shared `identity` and `createDispatch` helpers to `core/shared/`, removing duplication across all 5 framework adapters.
  - **`getStore.ts`**: improved `reducerByStore` WeakMap typing from `object` to a function type.
  - **JSDoc**: added JSDoc with `@param`, `@returns`, and `@example` to all public API exports — `create` (5 frameworks), `pipe`, `definePipeableMiddleware`, `adaptor`, `debounce`, `throttle`, `logger`, `validate`, `devtools`, `history`, `persist`, `dispose`, and key types (`UseState`, `UseReducer`, `ReducerAction`, `ReduceFn`, `HistoryControls`, `HistoryOptions`, `PersistControls`).

  #### Docs

  - **selector-semantics**: replaced outdated `deepCompare` references with the current `shallow` comparison table, including RegExp and built-in reference-equality behavior. Updated both EN and KO.
  - **persist**: updated cookie write description to reflect `path=/`. Updated both EN and KO.
  - **validate**: documented the new `onError` option and custom error handling. Updated both EN and KO.
  - **troubleshooting**: verified existing content remains accurate.

  #### Test helper

  - **`MemoryCookieDocument`**: updated the cookie setter to parse cookie attributes (`path`, `max-age`, etc.) and store only the name=value pair, matching real browser behavior.

- Updated dependencies [bb26d48]
- Updated dependencies [dc598b5]
- Updated dependencies [c850635]
- Updated dependencies [f3be972]
  - @ilokesto/store@2.0.0
