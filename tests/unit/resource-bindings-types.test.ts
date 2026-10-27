import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { compileTypeFixture } from '../fixtures/helpers/compileTypeFixture';

test('resource bindings: source and public declarations -> infer native state, input and Suspense contracts', () => {
  const result = compileTypeFixture('valid', {
    fixtureRoot: join(import.meta.dir, '..', 'fixtures/resource-bindings-types'),
    configPath: join(import.meta.dir, '..', 'fixtures/adapter-readonly-types/tsconfig.json'),
  });

  expect(result.success, result.diagnostics).toBe(true);
});
