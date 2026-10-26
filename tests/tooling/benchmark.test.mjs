import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { measureBehavior, measurePackage } from '../../scripts/benchmark.mjs';

test('measureBehavior: twenty commits -> reports actual selector, history and storage work', async () => {
  const result = await measureBehavior(20);

  assert.equal(result.selector.computations, 21);
  assert.equal(result.selector.notifications, 2);
  assert.equal(result.history.commits, 20);
  assert.equal(result.history.undos, 20);
  assert.equal(result.history.redos, 20);
  assert.equal(result.history.notifications, 60);
  assert.equal(result.storage.reads, 1);
  assert.equal(result.storage.writes, 20);
  assert.equal(result.storage.removes, 1);
  assert.equal(result.storage.disposals, 1);
  assert.ok(result.storage.envelopeJsonBytes > 0);
});

test('measureBehavior: invalid workload -> rejects rather than silently running no work', async () => {
  await assert.rejects(measureBehavior(0), RangeError);
  await assert.rejects(measureBehavior(1.5), RangeError);
});

test('measureBehavior: history capacity exceeded -> reports bounded replay work', async () => {
  const result = await measureBehavior(320);

  assert.equal(result.history.undos, 300);
  assert.equal(result.history.redos, 300);
  assert.equal(result.history.notifications, 920);
  assert.equal(result.storage.writes, 320);
});

test('measurePackage: actual export map -> measures each subpath without timing thresholds', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

  const result = await measurePackage();

  assert.deepEqual(Object.keys(result.bundles), Object.keys(manifest.exports));
  assert.ok(result.distBytes > 0);
  assert.equal(result.bundles['./package.json'].metadataBytes, result.manifestBytes);
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    if (typeof target !== 'string') {
      assert.ok(result.bundles[subpath].bytes > 0);
      assert.ok(result.bundles[subpath].gzipBytes > 0);
    }
  }
});
