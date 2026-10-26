---
"@ilokesto/state": minor
---

Add DevTools options for explicit enablement, detached state/action sanitizers, serialization, and custom replay decoding while preserving `devtools(name)` and its production default.

Support validated `JUMP_TO_STATE` and `JUMP_TO_ACTION` snapshots without feedback sends, reset the local history baseline, and preserve persistence of accepted jumps. Observe reducer payloads and nested committed snapshots, reject malformed commands, and stop all observation and command handling after disposal.
