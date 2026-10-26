import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { compileTypeFiles } from './helpers/compileTypeFiles';

test('scope declarations: enhanced factories and borrowed stores -> capabilities and adapter types are preserved', () => {
  const result = compileTypeFiles([join(import.meta.dir, 'fixtures/scope-types/valid.ts')]);

  expect(result.success, result.diagnostics).toBe(true);
});

test('scope declarations: readonly ownership and incompatible hydration -> invalid consumers are rejected', () => {
  const result = compileTypeFiles([join(import.meta.dir, 'fixtures/scope-types/invalid.ts')]);

  expect(result.success).toBe(false);
  expect(result.diagnostics.split('error TS').length - 1).toBe(6);
});
