import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { compileTypeFixture } from './helpers/compileTypeFixture';

const fixtureRoot = join(import.meta.dir, 'fixtures/history-types');
const configPath = join(import.meta.dir, 'fixtures/pipe-types/tsconfig.json');

for (const fixture of ['valid', 'dist-valid']) {
  test(`history types: ${fixture} selected strategies -> preserves state patch metadata and group result types`, () => {
    const result = compileTypeFixture(fixture, { fixtureRoot, configPath });

    expect(result.diagnostics).toBe('');
    expect(result.exitCode).toBe(0);
  });
}

test('history types: missing restore mismatched patches async groups and incompatible states -> rejects each contract violation', () => {
  const result = compileTypeFixture('invalid', { fixtureRoot, configPath });
  const diagnostics = result.diagnostics.split('\n').filter(line => line.includes('error TS'));

  expect(result.exitCode).toBe(1);
  expect(diagnostics).toHaveLength(7);
  expect(result.diagnostics).not.toContain('Cannot find module');
});
