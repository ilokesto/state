import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { packRelease } from '../../scripts/release-verify.mjs';

const repository = path.resolve(import.meta.dirname, '../..');

test('packRelease: freshly packed archive -> stable gzip header and saved digest', async t => {
  const destination = await mkdtemp(path.join(os.tmpdir(), 'state-release-pack-'));
  t.after(() => rm(destination, { recursive: true, force: true }));

  const packed = await packRelease(repository, destination);
  const saved = await readFile(path.join(destination, packed.file));
  const digest = createHash('sha256').update(packed.bytes).digest('hex');
  t.diagnostic(JSON.stringify({
    file: packed.file,
    bytes: saved.length,
    gzipOSByte: saved[9],
    returnedBytesEqualSaved: packed.bytes.equals(saved),
    returnedSha256: packed.packSha256,
    savedSha256: createHash('sha256').update(saved).digest('hex'),
  }));

  assert.equal(packed.bytes[9], 3);
  assert.deepEqual(packed.bytes, saved);
  assert.equal(packed.packSha256, digest);
});
