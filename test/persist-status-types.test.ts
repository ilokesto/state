import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { compileTypeFiles } from './helpers/compileTypeFiles';

test('persistence bindings: public declarations -> infer readonly full status and custom selections in five adapters', () => {
  const result = compileTypeFiles([join(import.meta.dir, 'fixtures/persist-status-contracts.ts')]);

  expect(result.success, result.diagnostics).toBe(true);
}, { timeout: 20_000 });
