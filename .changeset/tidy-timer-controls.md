---
"@ilokesto/state": minor
---

Add namespaced debounce/throttle flush, cancel, and pending controls, opt-in quiet-window debounce, and configurable leading/trailing edges while preserving legacy defaults. History now records actual timer commits and cancels pending timer work before synchronous, validated undo/redo. Timer disposal prevents in-flight updater batches from committing afterward; persistence flush remains separate from timer flush.
