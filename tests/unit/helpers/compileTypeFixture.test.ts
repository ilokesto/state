import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { compileTypeFixture } from '../../fixtures/helpers/compileTypeFixture';

test('Given a valid fixture, when compiled through the shared helper, then it succeeds without diagnostics', () => {
  // Given / When
  const result = compileTypeFixture('valid-types');

  // Then
  expect(result.success).toBeTrue();
  expect(result.exitCode).toBe(0);
  expect(result.diagnostics).toBe('');
}, { timeout: 20_000 });

test('Given an intentionally invalid fixture, when compiled through the shared helper, then it returns its diagnostic marker', () => {
  // Given / When
  const result = compileTypeFixture('invalid-harness');

  // Then
  expect(result.success).toBeFalse();
  expect(result.exitCode).toBe(1);
  expect(result.diagnostics).toContain('__fixtureExpectedError');
});

test('Given an unknown fixture, when compiled through the shared helper, then it returns a harness failure', () => {
  // Given / When
  const result = compileTypeFixture('unknown-fixture');

  // Then
  expect(result.success).toBeFalse();
  expect(result.exitCode).toBe(1);
  expect(result.diagnostics).toContain('TF1001');
});

test('Given a changed shared configuration, when a fixture is recompiled, then stale config is not reused', () => {
  // Given
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'ilokesto-state-type-config-'));
  const configPath = join(temporaryDirectory, 'tsconfig.json');
  const projectRoot = join(import.meta.dir, '..', '..', '..');
  writeFileSync(
    configPath,
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'bundler',
        noEmit: true,
        rootDir: projectRoot,
        skipLibCheck: true,
        strict: true,
        target: 'ESNext',
        typeRoots: [join(projectRoot, 'node_modules', '@types')],
        types: ['node'],
      },
      files: [join(projectRoot, 'tests', 'fixtures', 'pipe-types', 'valid-types', 'index.ts')],
    }),
  );

  try {
    // When
    const firstResult = compileTypeFixture('valid-types', { configPath });
    writeFileSync(configPath, '{"compilerOptions":');
    const malformedResult = compileTypeFixture('valid-types', { configPath });

    // Then
    expect(firstResult.success, firstResult.diagnostics).toBeTrue();
    expect(malformedResult.success).toBeFalse();
    expect(malformedResult.exitCode).toBe(1);
    expect(malformedResult.diagnostics).toContain('error TS');
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}, { timeout: 20_000 });
