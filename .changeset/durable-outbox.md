---
"@ilokesto/state": minor
---

Add an opt-in, framework-neutral durable outbox with explicit account storage keys,
validated operations, persist-before-send and durable ACK removal, restart recovery,
observable delivery state, bounded retry/backoff, cancellation, and explicit conflict
resolution. Delivery is at least once and requires server-side idempotency; no backend
dependency, automatic key migration, or exactly-once guarantee is introduced.
