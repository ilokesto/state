---
"@ilokesto/state": minor
---

Add framework-neutral `createResource`, `createEffect`, and `listenActions` APIs.
Resources expose read-only discriminated state and latest-wins async execution
with explicit cancellation outcomes, AbortSignal support, and disposal. Effects
and explicit action sources support cleanup, async error delivery, and safe
reentrant lifecycle handling without changing synchronous reducer dispatch.
