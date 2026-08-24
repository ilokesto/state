import { expect, test } from 'bun:test';
import { join } from 'node:path';

import { pipeTypeFixtureCases } from './helpers/pipeTypeFixtureRegistry';

const projectRoot = join(import.meta.dir, '..');

test('Given state type fixtures, when their compiler configs are listed, then only shared fixture and test configs remain', () => {
  // Given / When
  const configs = [
    ...new Bun.Glob('test/**/tsconfig.json').scanSync({ cwd: projectRoot }),
  ].sort();

  // Then
  expect(configs).toEqual([
    'test/fixtures/adapter-readonly-types/tsconfig.json',
    'test/fixtures/pipe-types/tsconfig.json',
    'test/tsconfig.json',
  ]);
});

test('Given pipe type fixtures, when fixture indexes are discovered recursively, then registry keys match exactly', () => {
  // Given / When
  const fixturePrefix = 'test/fixtures/pipe-types/';
  const indexSuffix = '/index.ts';
  const discovered = [...new Bun.Glob(`${fixturePrefix}**${indexSuffix}`).scanSync({ cwd: projectRoot })]
    .map((path) => path.slice(fixturePrefix.length, -indexSuffix.length))
    .sort();
  const registered = Object.keys(pipeTypeFixtureCases).sort();

  // Then
  expect(discovered).toEqual(registered);
});
