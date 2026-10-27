import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';

let directory;
let server;
let browser;
let origin;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'state-resources-'));
  const bundle = join(directory, 'resources.js');
  await promisify(execFile)('bun', ['run', new URL('../tooling/browser/build-resources.mjs', import.meta.url).pathname, bundle]);
  const script = await readFile(bundle);
  server = createServer((request, response) => {
    if (request.url === '/resources.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' }).end(script);
    } else {
      response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html><body></body></html>');
    }
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function fixture(name, argument) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin);
    const result = await page.evaluate(async ({ name, argument }) => {
      const module = await import('/resources.js');
      return module[name](argument);
    }, { name, argument });
    assert.deepEqual(errors, []);
    return result;
  } finally {
    await page.close();
  }
}

for (const framework of ['vue', 'solid', 'svelte', 'angular']) {
  test(`bindResource ${framework}: loading, error and retry -> native lifecycle releases only its subscription`, { timeout: 15000 }, async () => {
    const result = await fixture('nativeLifecycle', framework);

    assert.deepEqual(result, {
      states: ['idle', 'pending', 'success:first', 'error:failed', 'pending', 'success:retry'],
      rendered: 'retry', active: 1, remaining: 0, aborted: false, stopped: 'pending',
      outcome: { status: 'success', data: 'shared' },
    });
  });
}

test('React useSuspense: success, error, retry, cancel and dispose -> stable promise and boundary recovery', { timeout: 15000 }, async () => {
  const result = await fixture('reactLifecycle');

  assert.deepEqual(result, {
    states: ['idle', 'loading', 'first', 'error', 'loading', 'retry', 'idle', 'idle', 'idle'],
    stablePromise: true, exactError: true, skipped: 'cancelled', remaining: 0,
  });
});

for (const initiallyPending of [false, true]) {
  test(`React useSuspense: unmount ${initiallyPending ? 'before' : 'after'} first commit -> no subscription leak or shared cancellation`, { timeout: 15000 }, async () => {
    const result = await fixture('reactUnmount', initiallyPending);

    assert.equal(result.remaining, 0);
    assert.equal(result.aborted, false);
    assert.equal(result.status, 'success');
    if (initiallyPending) assert.equal(result.pendingSubscriptions, 0);
  });
}

test('React useSuspense: superseded and pre-aborted runs -> latest promise stays stable', { timeout: 15000 }, async () => {
  const result = await fixture('reactReplacement');

  assert.deepEqual(result, { replaced: true, retained: true, text: 'latest', skipped: 'cancelled', remaining: 0 });
});

for (const suspense of [false, true]) {
  test(`React bindResource: external run with suspense=${suspense} -> observes state or fails without a hanging promise`, { timeout: 15000 }, async () => {
    const result = await fixture('reactExternalRun', suspense);

    assert.deepEqual(result, suspense
      ? { pending: 'error', complete: 'error', errors: 1, remaining: 0 }
      : { pending: 'pending', complete: 'external', errors: 0, remaining: 0 });
  });
}

for (const operation of ['cancel', 'dispose']) {
  test(`React useSuspense: ${operation} before first commit -> wakes to idle without a render-time subscription`, { timeout: 15000 }, async () => {
    const result = await fixture('reactInitialCancel', operation);

    assert.deepEqual(result, { text: 'idle', aborted: true, pendingSubscriptions: 0, remaining: 0 });
  });
}
