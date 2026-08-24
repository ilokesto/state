import { expect, test } from 'bun:test';
import { join } from 'node:path';

const projectRoot = join(import.meta.dir, '..');

const distributionImportMatrix = `
const root = await import('@ilokesto/state');
const { adaptor } = await import('@ilokesto/state/adaptor');
const { create: createReact } = await import('@ilokesto/state/react');
const { create: createVue } = await import('@ilokesto/state/vue');
const { create: createAngular } = await import('@ilokesto/state/angular');
const { create: createSvelte } = await import('@ilokesto/state/svelte');
const { create: createSolid } = await import('@ilokesto/state/solid');
const { throttle } = await import('@ilokesto/state/middleware');
const { definePipeableMiddleware, pipe } = await import('@ilokesto/state/utils');
const { default: packageJson } = await import('@ilokesto/state/package.json', { with: { type: 'json' } });

if (Object.keys(root).length !== 0) throw new TypeError('Expected the root export to remain empty');
if (adaptor((draft) => { draft.count += 1; })({ count: 1 }).count !== 2) throw new TypeError('Expected adaptor to produce immutable updates');
if (![createReact, createVue, createAngular, createSvelte, createSolid].every((create) => typeof create === 'function')) throw new TypeError('Expected each framework export to provide create');
if (typeof throttle !== 'function') throw new TypeError('Expected middleware to provide throttle');
if (typeof pipe.use !== 'function' || typeof definePipeableMiddleware !== 'function') throw new TypeError('Expected utils to provide pipe composition');
if (packageJson.name !== '@ilokesto/state' || packageJson.exports['./package.json'] !== './package.json') throw new TypeError('Expected package metadata export');
`;

test('Given a built package, when Node imports every public export, then each distribution entry resolves with its public shape', () => {
  // Given / When
  const result = Bun.spawnSync({
    cmd: ['node', '--input-type=module', '--eval', distributionImportMatrix],
    cwd: projectRoot,
    stderr: 'pipe',
    stdout: 'pipe',
  });

  // Then
  expect(result.exitCode).toBe(0);
}, { timeout: 20_000 });
