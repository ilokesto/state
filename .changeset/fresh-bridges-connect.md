---
"@ilokesto/state": minor
---

Add opt-in query observer, actor snapshot/event, and typed URL parameter bridges
to the root and utils exports. Bridges reuse registry store primitives, preserve
borrowed runtime ownership and snapshot identity, and provide explicit disposal.
URL state supports injected SSR/browser environments, codecs, defaults,
push/replace history, and native back/forward synchronization.
