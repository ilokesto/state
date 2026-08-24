import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const projectRoot = join(import.meta.dir, '..');
const decoder = new TextDecoder();

type ProcessResult = {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
};

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

function run(cmd: readonly string[], cwd: string): ProcessResult {
  const result = Bun.spawnSync({ cmd: [...cmd], cwd, stderr: 'pipe', stdout: 'pipe' });
  return {
    exitCode: result.exitCode,
    stderr: decoder.decode(result.stderr),
    stdout: decoder.decode(result.stdout),
  };
}

function packInto(packDir: string, packageDir: string, targetDir: string): ProcessResult {
  const pack = run(['pnpm', 'pack', '--pack-destination', packDir], packageDir);
  if (pack.exitCode !== 0) {
    return pack;
  }
  const tarball = pack.stdout.trim().split('\n').at(-1) ?? '';
  mkdirSync(targetDir, { recursive: true });
  return run(['tar', '-xzf', tarball, '-C', targetDir, '--strip-components=1'], packageDir);
}

function createIsolatedConsumer(): string {
  const workDir = mkdtempSync(join(tmpdir(), 'ilokesto-state-no-immer-'));
  tempDirs.push(workDir);

  const packDir = join(workDir, 'packs');
  const consumerDir = join(workDir, 'consumer');
  mkdirSync(packDir);
  mkdirSync(consumerDir);
  writeFileSync(join(consumerDir, 'package.json'), '{"name":"consumer","type":"module"}\n');

  const packStore = packInto(
    packDir,
    join(projectRoot, '..', 'store'),
    join(consumerDir, 'node_modules', '@ilokesto', 'store'),
  );
  const packState = packInto(packDir, projectRoot, join(consumerDir, 'node_modules', '@ilokesto', 'state'));

  for (const result of [packStore, packState]) {
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
  }

  return consumerDir;
}

test('Given immer is not resolvable, when a packed consumer imports @ilokesto/state/utils, then the import succeeds without adaptor', () => {
  // Given: an isolated consumer with only the packed @ilokesto/state and @ilokesto/store - no immer anywhere on the resolution path.
  const consumerDir = createIsolatedConsumer();

  // When
  const result = run(
    [
      'node',
      '--input-type=module',
      '--eval',
      "const m = await import('@ilokesto/state/utils'); if (typeof m.pipe?.use !== 'function') throw new TypeError('Expected pipe builder export'); if ('adaptor' in m) throw new Error('adaptor must not be exported from @ilokesto/state/utils');",
    ],
    consumerDir,
  );

  // Then
  expect(result.exitCode).toBe(0);
}, { timeout: 180_000 });

test('Given immer is not resolvable, when a packed consumer imports @ilokesto/state/adaptor, then resolution fails on immer only', () => {
  // Given / When
  const consumerDir = createIsolatedConsumer();

  const result = run(
    ['node', '--input-type=module', '--eval', "await import('@ilokesto/state/adaptor');"],
    consumerDir,
  );

  // Then: the adaptor subpath itself resolves; the only missing module is the optional immer peer.
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain('ERR_MODULE_NOT_FOUND');
  expect(result.stderr).toContain('immer');
  expect(result.stderr).toContain('dist/utils/adaptor.js');
  expect(result.stderr).not.toContain('ERR_PACKAGE_PATH_NOT_EXPORTED');
}, { timeout: 180_000 });

test('Given the workspace where immer is installed, when Node imports the adaptor subpath, then adaptor produces immutable updaters', () => {
  // Given / When
  const result = run(
    [
      'node',
      '--input-type=module',
      '--eval',
      "const { adaptor } = await import('@ilokesto/state/adaptor'); const next = adaptor((draft) => { draft.count += 1; })({ count: 1 }); if (next.count !== 2) throw new Error('adaptor did not produce the next state');",
    ],
    projectRoot,
  );

  // Then
  expect(result.exitCode).toBe(0);
}, { timeout: 180_000 });
