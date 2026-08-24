import { expect, test } from 'bun:test';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { compileTypeFixture } from './helpers/compileTypeFixture';
import {
  pipeTypeFixtureCases,
  type PipeTypeFixtureCase,
} from './helpers/pipeTypeFixtureRegistry';

type InvalidFixture = Extract<PipeTypeFixtureCase, { readonly kind: 'invalid' | 'dist-invalid' }> & {
  readonly diagnosticCount: number;
  readonly expectedMarkers: readonly string[];
};

const projectRoot = join(import.meta.dir, '..');
function expectInvalidFixture(fixture: string, contract: InvalidFixture): void {
  const result = compileTypeFixture(fixture);
  const diagnosticLines = result.diagnostics.split('\n').filter((line) => line.includes('error TS'));

  expect(result.success).toBeFalse();
  expect(result.exitCode).toBe(1);
  expect(diagnosticLines).toHaveLength(contract.diagnosticCount);
  for (const marker of contract.expectedMarkers) {
    expect(result.diagnostics).toContain(marker);
  }
  expect(result.diagnostics).not.toContain('Cannot find module');
  expect(result.diagnostics).not.toContain('TS5058');
}

test('Given public pipe contracts, when valid fixtures compile in isolated programs, then they exit successfully', () => {
  // Given / When / Then
  for (const [fixture, contract] of Object.entries(pipeTypeFixtureCases)) {
    if (contract.kind !== 'valid') continue;
    const result = compileTypeFixture(fixture);
    expect(result.success).toBeTrue();
    expect(result.exitCode).toBe(0);
    expect(result.diagnostics).toBe('');
  }
}, { timeout: 180_000 });

test('Given invalid pipe contracts, when their isolated programs compile, then their branded diagnostics are preserved', () => {
  // Given / When / Then
  const harnessResult = compileTypeFixture('invalid-harness');
  expect(harnessResult.success).toBeFalse();
  expect(harnessResult.diagnostics).toContain('__fixtureExpectedError');
  for (const [fixture, contract] of Object.entries(pipeTypeFixtureCases)) {
    if (contract.kind !== 'invalid') continue;
    expectInvalidFixture(fixture, contract);
  }
}, { timeout: 180_000 });

test('Given generated declarations, when public fixtures compile in isolated programs, then public contracts remain correct', () => {
  // Given
  const sourceModifiedAt = statSync(join(projectRoot, 'src/utils/index.ts')).mtimeMs;
  const declarationPath = join(projectRoot, 'dist/utils/pipe/createPipeBuilder.d.ts');
  const publicDeclarationPath = join(projectRoot, 'dist/utils/index.d.ts');
  const pipeTypesDeclarationPath = join(projectRoot, 'dist/utils/pipe/types.d.ts');

  // When
  const validResult = compileTypeFixture('dist-consumer');
  const rootDeclaration = readFileSync(declarationPath, 'utf8');
  const publicDeclaration = readFileSync(publicDeclarationPath, 'utf8');
  const pipeTypeDeclaration = readFileSync(pipeTypesDeclarationPath, 'utf8').match(
    /export type Pipe = \{[\s\S]*?\n\};/,
  )?.[0];

  // Then
  expect(statSync(declarationPath).mtimeMs).toBeGreaterThanOrEqual(sourceModifiedAt);
  expect(validResult.success).toBeTrue();
  expect(validResult.diagnostics).toBe('');
  const invalidContract = pipeTypeFixtureCases['dist-consumer/public-invalid'];
  expectInvalidFixture('dist-consumer/public-invalid', invalidContract);
  expect(rootDeclaration).toContain('export declare const pipe: Pipe;');
  expect(rootDeclaration).not.toContain('declare function pipe');
  expect(pipeTypeDeclaration).toBeDefined();
  expect(pipeTypeDeclaration ?? '').not.toContain('create');
  expect(publicDeclaration).toContain("export { pipe } from './pipe/index.js';");
  expect(publicDeclaration).toContain('PipeConfigurationError');
  expect(publicDeclaration).not.toMatch(/\bPipeableMiddleware\b/);
  expect(publicDeclaration).not.toContain('PipeMetadataSnapshot');
  expect(publicDeclaration).not.toContain('validation-types');
}, { timeout: 180_000 });
