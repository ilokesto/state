import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { compileTypeFiles } from './helpers/compileTypeFiles';

test('outbox public types: operation inference and transport protocol -> compile against distribution', () => {
  const fixture = join(import.meta.dir, 'fixtures/outbox-contracts.ts');

  const result = compileTypeFiles([fixture]);

  expect(result.success, result.diagnostics).toBe(true);
}, { timeout: 20_000 });
