---
"@ilokesto/state": minor
---

### persist: SSR safety and manual hydration API

#### What changed
- `persist` no longer crashes on the server. `readStorageValue` and `getCookie` now return `null` when `window` or `document` is unavailable, so store evaluation is safe in SSR environments (Next.js App Router, Nuxt, etc.).
- Added `skipHydration` option to all persist config variants (`local`, `cookie`, `session`). When `true`, the store keeps its initial state at creation time instead of eagerly applying the persisted value.
- Added `store.persist.rehydrate()` to manually trigger hydration from storage. Safe to call once; subsequent calls are no-ops.
- Added `store.persist.hasHydrated()` to check whether hydration has completed.
- Added `onRehydrateStorage` option: a factory that receives the current state and returns a callback invoked with the rehydrated state and any error.
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