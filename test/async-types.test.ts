import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { compileTypeFiles } from './helpers/compileTypeFiles';

test('async public types: resource inference and effect contracts -> compile against distribution', () => {
  const fixture = join(import.meta.dir, 'fixtures/async-contracts.ts');

  const result = compileTypeFiles([fixture]);

  expect(result.success, result.diagnostics).toBe(true);
}, { timeout: 20_000 });
