# @ilokesto/state

This directory contains the `@ilokesto/state` package in the ilokesto pnpm monorepo.

## What this package is

Higher-level state primitives built on top of `@ilokesto/store`: plain state, reducer state, middleware, and framework adapters.

## When modifying this package

1. Read the root `AGENTS.md`, `PACKAGES.md`, and `ARCHITECTURE.md`.
2. Load the `ilokesto-state` skill from `.opencode/skills/ilokesto-state/SKILL.md`.
3. Keep core state logic framework-agnostic; put React/Vue/Solid/Svelte/Angular bindings in separate subpaths.
4. Run tests with `pnpm test` (uses Bun).
5. Add a changeset with `pnpm changeset` for any consumer-facing change.

## Release flow

1. Open a PR with a root changeset.
2. After CI passes on `main`, the root workflow's release job opens a `ci: release` PR.
3. Merge the release PR to publish to npm.

## Must not do

- Do not duplicate `@ilokesto/store` primitives here.
- Do not add framework-specific code to the core state modules.
