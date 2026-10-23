import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git } from '../../scripts/verify-migration.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const manifest = await readFile(path.join(repository, '.migration/source-manifest.json'), 'utf8');
const currentPackages = await Promise.all([
  'package.json', 'website/package.json', 'docs-publication/runtime/package.json',
].map(async file => [file, JSON.parse(await readFile(path.join(repository, file), 'utf8'))]));
const put = async (root, file, value) => {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), JSON.stringify(value));
};

async function fixture(t, workspaces = false) {
  await mkdir(path.join(repository, '.qa-run'), { recursive: true });
  const parent = await mkdtemp(path.join(repository, '.qa-run/state-scanner-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'repo');
  const outside = path.join(parent, 'outside');
  await mkdir(root);
  await mkdir(outside);
  await git(root, ['init', '--quiet']);
  for (const [file, value] of workspaces ? currentPackages : currentPackages.slice(0, 1)) {
    await put(root, file, value);
  }
  return { root, outside };
}

function verify(t, root) {
  const args = [path.join(repository, 'scripts/verify-migration.mjs'), 'standalone', '--repo', root, '--manifest-stdin', '-'];
  const result = spawnSync(process.execPath, args, {
    cwd: root, input: manifest, encoding: 'utf8', timeout: 10_000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  const output = JSON.parse(result.status === 0 ? result.stdout : result.stderr);
  t.diagnostic(JSON.stringify({ command: [process.execPath, ...args], exitCode: result.status, stdout: result.stdout, stderr: result.stderr }));
  return { exitCode: result.status, ...output };
}

function rejects(t, root, code) {
  const result = verify(t, root);
  assert.equal(result.exitCode, 1);
  assert.equal(result.code, code);
}

for (const staged of [false, true]) {
  test(`standalone discovery: ${staged ? 'staged' : 'untracked'} current private workspaces -> all three manifests accepted`, async t => {
    const { root } = await fixture(t, true);
    if (staged) await git(root, ['add', '.']);

    const result = verify(t, root);

    assert.equal(result.exitCode, 0);
    assert.equal(result.results[0].manifests, 3);
  });
}

test('standalone discovery: untracked sibling workspace -> rejected after root is staged', async t => {
  const { root } = await fixture(t);
  await git(root, ['add', 'package.json']);
  await put(root, 'examples/new-example/package.json', {
    name: '@ilokesto/state-example', private: true, dependencies: { '@ilokesto/store': 'workspace:*' },
  });

  rejects(t, root, 'SIBLING_DEPENDENCY');
});

test('standalone discovery: frozen and generated manifests -> excluded without hiding docs runtime', async t => {
  const { root } = await fixture(t, true);
  for (const file of [
    'docs-publication/releases/state/2.0.1/r1/package.json',
    '.migration/fixture/package.json',
    'website/.next/package.json',
    'website/.source/package.json',
    'docs-publication/runtime/.generated/package.json',
    'node_modules/unrelated/package.json',
    'dist/package.json',
  ]) {
    await put(root, file, { dependencies: { '@ilokesto/store': 'workspace:*' } });
  }
  await git(root, ['add', '.']);

  const result = verify(t, root);
  assert.equal(result.exitCode, 0);
  assert.equal(result.results[0].manifests, 3);
  await put(root, 'docs-publication/runtime/package.json', {
    name: '@ilokesto/state-docs-runtime', private: true, dependencies: { '@ilokesto/store': 'workspace:*' },
  });
  rejects(t, root, 'SIBLING_DEPENDENCY');
});

for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
  test(`standalone dependency: sibling workspace in ${section} -> rejected`, async t => {
    const { root } = await fixture(t);
    await put(root, 'website/package.json', {
      name: '@ilokesto/state-website', private: true, [section]: { '@ilokesto/store': 'workspace:*' },
    });
    await git(root, ['add', '.']);

    rejects(t, root, 'SIBLING_DEPENDENCY');
  });
}

test('standalone workspace: root, public consumer, missing target and disguised sibling -> rejected', async t => {
  const { root } = await fixture(t, true);
  await git(root, ['add', '.']);
  await put(root, 'package.json', { name: '@ilokesto/state', dependencies: { '@ilokesto/state': 'workspace:*' } });
  rejects(t, root, 'SIBLING_DEPENDENCY');
  await put(root, 'package.json', currentPackages[0][1]);
  await put(root, 'website/package.json', {
    name: '@ilokesto/state-website', dependencies: { '@ilokesto/state': 'workspace:*' },
  });
  rejects(t, root, 'SIBLING_DEPENDENCY');
  await put(root, 'website/package.json', {
    name: '@ilokesto/state-website', private: true, dependencies: { '@ilokesto/missing-runtime': 'workspace:*' },
  });
  rejects(t, root, 'SIBLING_DEPENDENCY');
  await put(root, 'website/package.json', {
    name: '@ilokesto/state-website', private: true, dependencies: { '@ilokesto/store': 'workspace:*' },
  });
  await put(root, 'local-store/package.json', { name: '@ilokesto/store', private: true });
  rejects(t, root, 'SIBLING_DEPENDENCY');
});

test('standalone workspace: duplicate private package name -> rejected', async t => {
  const { root } = await fixture(t, true);
  await put(root, 'duplicate/package.json', { name: '@ilokesto/state-docs-runtime', private: true });

  rejects(t, root, 'DUPLICATE_WORKSPACE_NAME');
});

test('standalone workspace: own name redirects to a sibling path or alias -> rejected', async t => {
  const { root } = await fixture(t, true);
  for (const range of ['workspace:../../store', 'workspace:%2e%2e/%2e%2e/store', 'workspace:@ilokesto/store@*']) {
    await put(root, 'website/package.json', {
      name: '@ilokesto/state-website', private: true, dependencies: { '@ilokesto/state': range },
    });

    rejects(t, root, 'SIBLING_DEPENDENCY');
  }
});

for (const [name, range] of [
  ['runtime', 'workspace:@ilokesto/state-docs-runtime@*'],
  ['own-state', 'workspace:@ilokesto/state@^2.0.1'],
  ['runtime', 'workspace:../docs-publication/runtime'],
  ['own-state', 'workspace:..'],
]) {
  test(`supported reference: ${range} -> own root or private workspace accepted`, async t => {
    const { root } = await fixture(t, true);
    await put(root, 'website/package.json', {
      name: '@ilokesto/state-website', private: true, dependencies: { [name]: range },
    });

    assert.equal(verify(t, root).exitCode, 0);
  });
}

for (const protocol of ['file', 'link']) {
  for (const spelling of ['../outside', './nested/../../outside', '.\\nested\\..\\..\\outside']) {
    test(`standalone path: ${protocol}:${spelling} -> normalized escape rejected`, async t => {
      const { root } = await fixture(t);
      await put(root, 'package.json', { name: '@ilokesto/state', dependencies: { external: `${protocol}:${spelling}` } });
      await git(root, ['add', '.']);

      rejects(t, root, 'EXTERNAL_DEPENDENCY_PATH');
    });
  }

  test(`standalone path: absolute ${protocol} dependency -> rejected`, async t => {
    const { root, outside } = await fixture(t);
    await put(root, 'package.json', { name: '@ilokesto/state', dependencies: { external: `${protocol}:${outside}` } });

    rejects(t, root, 'EXTERNAL_DEPENDENCY_PATH');
  });

  test(`standalone path: ${protocol} target follows ignored symlink outside repo -> rejected`, async t => {
    const { root, outside } = await fixture(t);
    await writeFile(path.join(root, '.gitignore'), 'bridge\n');
    await symlink(outside, path.join(root, 'bridge'), 'dir');
    await put(root, 'package.json', { name: '@ilokesto/state', dependencies: { external: `${protocol}:./bridge` } });

    rejects(t, root, 'EXTERNAL_DEPENDENCY_PATH');
  });

  test(`supported reference: ${protocol} literal percent directory -> accepted without URI decoding`, async t => {
    const { root } = await fixture(t);
    await put(root, '%2e%2e/payload/package.json', { name: 'state-local-data', private: true });
    await put(root, 'package.json', { name: '@ilokesto/state', dependencies: { 'state-local-data': `${protocol}:%2e%2e/payload` } });

    assert.equal(verify(t, root).exitCode, 0);
  });

  test(`supported reference: ${protocol} protocol slashes -> normalized private runtime accepted`, async t => {
    const { root } = await fixture(t, true);
    await put(root, 'website/package.json', {
      name: '@ilokesto/state-website', private: true,
      dependencies: { '@ilokesto/state-docs-runtime': `${protocol}://../docs-publication/runtime` },
    });

    assert.equal(verify(t, root).exitCode, 0);
  });
}

test('standalone path: internal relative local dependency -> accepted without relaxing external checks', async t => {
  const { root } = await fixture(t, true);
  await put(root, 'website/package.json', {
    name: '@ilokesto/state-website', private: true,
    dependencies: { '@ilokesto/state-docs-runtime': 'link:../docs-publication/runtime' },
  });

  assert.equal(verify(t, root).exitCode, 0);
});

test('supported reference: isolated pnpm workspace resolves the same local forms -> scanner accepts them', async t => {
  const { root } = await fixture(t);
  await put(root, 'package.json', { name: '@ilokesto/state', version: '2.0.1', private: true });
  await put(root, 'website/package.json', {
    name: '@ilokesto/state-website', private: true,
    dependencies: {
      'own-state': 'workspace:@ilokesto/state@*',
      runtime: 'workspace:@ilokesto/state-docs-runtime@*',
      'relative-runtime': 'workspace:../docs-publication/runtime',
      'linked-runtime': 'link://../docs-publication/runtime',
      'local-data': 'file:../%2e%2e/payload',
    },
  });
  await put(root, 'docs-publication/runtime/package.json', {
    name: '@ilokesto/state-docs-runtime', version: '0.0.0', private: true,
  });
  await put(root, '%2e%2e/payload/package.json', { name: 'state-local-data', version: '1.0.0', private: true });
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - .\n  - website\n  - docs-publication/runtime\n');

  const result = spawnSync('pnpm', ['install', '--lockfile-only', '--offline', '--ignore-scripts'], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });

  t.diagnostic(JSON.stringify({ command: ['pnpm', 'install', '--lockfile-only', '--offline', '--ignore-scripts'], cwd: root, exitCode: result.status, stdout: result.stdout, stderr: result.stderr }));
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const verification = verify(t, root);
  assert.equal(verification.exitCode, 0);
  assert.equal(verification.results[0].manifests, 4);
});

test('standalone path: repository manifest symlink escapes -> rejected', async t => {
  const { root, outside } = await fixture(t);
  await put(outside, 'package.json', { name: '@ilokesto/state-website', private: true });
  await mkdir(path.join(root, 'website'));
  await symlink(path.join(outside, 'package.json'), path.join(root, 'website/package.json'));

  rejects(t, root, 'EXTERNAL_REPOSITORY_PATH');
});

test('standalone path: untracked directory symlink escapes -> rejected', async t => {
  const { root, outside } = await fixture(t);
  await put(outside, 'package.json', { name: '@ilokesto/state-website', private: true });
  await symlink(outside, path.join(root, 'website'), 'dir');

  rejects(t, root, 'EXTERNAL_REPOSITORY_PATH');
});

test('standalone safety: private Queryable dependency and registry alias -> rejected', async t => {
  const { root } = await fixture(t);
  for (const dependencies of [
    { '@ilokesto/queryable': '0.0.1' },
    { query: 'npm:@ilokesto/queryable@0.0.1' },
  ]) {
    await put(root, 'package.json', { name: '@ilokesto/state', dependencies });
    rejects(t, root, 'PRIVATE_PACKAGE_DEPENDENCY');
  }
});

test('standalone scripts: legacy sibling build and sibling filter -> still rejected', async t => {
  const { root } = await fixture(t);
  for (const pretest of ['pnpm --dir ../store build', 'pnpm --filter @ilokesto/store run build']) {
    await put(root, 'package.json', { name: '@ilokesto/state', scripts: { pretest } });
    rejects(t, root, 'SIBLING_SCRIPT');
  }
});
