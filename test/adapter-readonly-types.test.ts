import { expect, test } from 'bun:test';
import { join } from 'node:path';

import { compileTypeFixture } from './helpers/compileTypeFixture';

type InvalidFixtureContract = Readonly<{
  diagnosticCount: number;
  expectedMarkers: readonly string[];
}>;

const fixtureRoot = join(import.meta.dir, 'fixtures', 'adapter-readonly-types');
const invalidFixtureContract: InvalidFixtureContract = {
  diagnosticCount: 15,
  expectedMarkers: [
    'angularSelectorMutation',
    'angularReadResultMutation',
    'angularFullResultMutation',
    'reactSelectorMutation',
    'reactReadResultMutation',
    'reactFullResultMutation',
    'solidSelectorMutation',
    'solidReadResultMutation',
    'solidFullResultMutation',
    'svelteSelectorMutation',
    'svelteReadResultMutation',
    'svelteFullResultMutation',
    'vueSelectorMutation',
    'vueReadResultMutation',
    'vueFullResultMutation',
  ],
};

function compileAdapterFixture(fixture: string) {
  return compileTypeFixture(fixture, { fixtureRoot });
}

function expectReadonlyMutationErrors(fixture: string): void {
  const result = compileAdapterFixture(fixture);
  const diagnosticLines = result.diagnostics.split('\n').filter((line) => line.includes('error TS'));

  expect(result.success).toBeFalse();
  expect(result.exitCode).toBe(1);
  expect(diagnosticLines).toHaveLength(invalidFixtureContract.diagnosticCount);
  for (const marker of invalidFixtureContract.expectedMarkers) {
    expect(result.diagnostics).toContain(marker);
  }
}

test('Given source adapter contracts, when valid selectors and lifecycle-free reads compile, then every adapter accepts them', () => {
  // Given / When
  const result = compileAdapterFixture('source-valid');

  // Then
  expect(result.success, result.diagnostics).toBeTrue();
  expect(result.exitCode).toBe(0);
  expect(result.diagnostics).toBe('');
});

test('Given source adapter contracts, when callable state is read, selected, or observed without a selector, then every adapter preserves its call signature', () => {
  // Given / When
  const result = compileAdapterFixture('source-callable-valid');

  // Then
  expect(result.success, result.diagnostics).toBeTrue();
  expect(result.exitCode).toBe(0);
  expect(result.diagnostics).toBe('');
});

test('Given source adapter contracts, when generic and overloaded callable state is read, selected, or observed without a selector, then every adapter preserves exact signatures', () => {
  // Given / When
  const result = compileAdapterFixture('source-callable-signatures-valid');

  // Then
  expect(result.success, result.diagnostics).toBeTrue();
  expect(result.exitCode).toBe(0);
  expect(result.diagnostics).toBe('');
});

test('Given source adapter contracts, when selectors or lifecycle-free reads mutate state, then every adapter rejects them', () => {
  // Given / When / Then
  expectReadonlyMutationErrors('source-invalid');
});

test('Given generated adapter declarations, when valid public-subpath consumers compile, then every adapter accepts them', () => {
  // Given / When
  const result = compileAdapterFixture('dist-valid');

  // Then
  expect(result.success, result.diagnostics).toBeTrue();
  expect(result.exitCode).toBe(0);
  expect(result.diagnostics).toBe('');
});

test('Given generated adapter declarations, when callable public-subpath state is read, selected, or observed without a selector, then every adapter preserves its call signature', () => {
  // Given / When
  const result = compileAdapterFixture('dist-callable-valid');

  // Then
  expect(result.success, result.diagnostics).toBeTrue();
  expect(result.exitCode).toBe(0);
  expect(result.diagnostics).toBe('');
});

test('Given generated adapter declarations, when generic and overloaded callable public-subpath state is read, selected, or observed without a selector, then every adapter preserves exact signatures', () => {
  // Given / When
  const result = compileAdapterFixture('dist-callable-signatures-valid');

  // Then
  expect(result.success, result.diagnostics).toBeTrue();
  expect(result.exitCode).toBe(0);
  expect(result.diagnostics).toBe('');
});

test('Given generated adapter declarations, when public-subpath selectors or lifecycle-free reads mutate state, then every adapter rejects them', () => {
  // Given / When / Then
  expectReadonlyMutationErrors('dist-invalid');
});
