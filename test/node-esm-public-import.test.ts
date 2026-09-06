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

const store = root.createStore(0);
store.update(value => value + 1);
if (store.getState() !== 1) throw new TypeError('Root store construction failed');
const reduced = root.createReducer((value, action) => value + action.amount, 0);
for (const framework of ['react', 'vue', 'angular', 'svelte', 'solid']) {
  const adapter = await import('@ilokesto/state/' + framework);
  if (adapter.bind(store).readOnly() !== 1) throw new TypeError('Plain binding lost store identity');
  const bound = adapter.bindReducer(reduced);
  bound.writeOnly()({ type: 'add', amount: 1 });
  if (bound.readOnly() !== reduced.store.getState()) throw new TypeError('Reducer binding lost state');
}
if (reduced.store.getState() !== 5) throw new TypeError('Shared reducer must run once per dispatch');
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
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
}, { timeout: 20_000 });
