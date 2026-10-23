# State 2.0.1 publication evidence

Observed on 2026-10-09 for the manual publication of the revised persist
documentation. Only State's public documentation selection changes.

## Release identity

- Package: `@ilokesto/state@2.0.1`, npm channel `latest`.
- Release and documentation commit:
  `e97069d019f2147f1f82201a2ac5b2c84f80c898`.
- Annotated tag: `@ilokesto/state@2.0.1`, peeling to the same commit.
- Documentation tree: `2e9f141f1fda8212bddd4fb0c8cb965971683476`.
- Publish run:
  https://github.com/ilokesto/ilokesto/actions/runs/37914157814
- Registry metadata: https://registry.npmjs.org/@ilokesto%2fstate/2.0.1
- Tarball: https://registry.npmjs.org/@ilokesto/state/-/state-2.0.1.tgz
- SHA-512:
  `sha512-JOM3S4GnQHIhTwXtLTcmr6vU3q8jv/NiiSPjWaY8eM0jUlpAGV0xsBfGvmebyaUehqmJ/lRy/alMa6JM63p91g==`.
- SHA-1: `158ab13d35c3d195c549cd646181d9de8bba45ef`.

## Source association

The successful Publish workflow checked out the release commit at
09:53:34 UTC. It invoked publication of State 2.0.1 at 09:56:14 UTC and
reported success at 09:56:17 UTC with the same tarball SHA-1.

The downloaded tarball contains 125 files. Its SHA-512 and SHA-1 match
the exact-version registry metadata. Both shipped READMEs match the
release source byte for byte. A frozen-lockfile installation followed by
`pnpm --filter @ilokesto/state... build` at the release commit reproduced
all 122 published distribution files byte for byte.

Capture also compares the complete shipped manifest with the release
manifest, allowing only the workspace protocol's published version rewrite.
State's published Store dependency is `^2.0.1`. The documentation runtime
must resolve that dependency from npm while retaining the other packages'
existing public documentation selections.

## Documentation scope

The English and Korean persist guide, migration guide, README examples,
and supporting composition, lifecycle, debounce, and troubleshooting
snippets use the new storage factories and explicit asynchronous lifecycle.
The changes since the active State revision are persist-related. The
existing card-editing demo is retained rather than replaced with a new UI.
Capture uses the release commit for both documentation and executable
examples; uncommitted source is not a publication input.

## Provenance limitation

The exact-version npm metadata exposes neither `gitHead` nor source
provenance attestations. Registry signatures identify the npm artifact,
not its source checkout. Workflow checkout, the annotated tag, README and
manifest comparison, and reproduced distribution bytes support the source
association but do not cryptographically prove it.
