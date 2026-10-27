# @ilokesto/state

This repository owns one public library.
Use Node 24.22.1 and pnpm 10.17.1. Run commands from this root.

- Keep the framework-agnostic core, ten export subpaths, middleware and all five
  framework adapters intact; `@ilokesto/store` is a registry dependency.
- Library source is in `src/`; Bun runtime tests are in `tests/unit/`, browser
  runners in `tests/browser/`, and compiler inputs, apps, and helpers in `tests/fixtures/`.
  Tooling tests and executable test helpers live in `tests/tooling/`; shared release
  tools and benchmarks stay in `scripts/`. `tests/tsconfig.json` excludes invalid inputs
  and browser apps from its broad compiler check.
- Keep other libraries as registry dependencies. Only this library and private workspaces
  inside this repository may use workspace links.
- Run `pnpm typecheck` for library source and `pnpm test` for the full verification:
  one build followed by unit, types, tooling, and browser suites once each.
- For focused checks, run `pnpm build` after source changes, then `pnpm test:unit`,
  `pnpm test:types`, `pnpm test:tooling`, or `pnpm test:browser`. These commands reuse
  `dist/`; browser tests require installed Playwright Chromium.
- Consumer-facing changes need a root Changeset.
- `release:verify --sha <full-SHA>` is read-only. Main merges maintain the Changesets release PR; merging
  it publishes only the exact successful Verify artifact through GitHub Actions with the
  latest dist-tag. Never publish locally.
- Before rollout, enable `Allow GitHub Actions to create and approve pull requests`
  and configure `NPM_TOKEN` in the `Production` environment.

## Must not do

- Do not duplicate `@ilokesto/store` primitives here.
- Do not add framework-specific code to the core state modules.
- Do not rename persistence keys or migrate consumer storage formats.
