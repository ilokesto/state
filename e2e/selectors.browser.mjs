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
  directory = await mkdtemp(join(tmpdir(), 'state-selectors-'));
  const bundle = join(directory, 'selectors.js');
  await promisify(execFile)('bun', ['run', new URL('./fixtures/build-selectors.mjs', import.meta.url).pathname, bundle]);
  const script = await readFile(bundle);
  server = createServer((request, response) => {
    if (request.url === '/selectors.js') {
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

for (const framework of ['vue', 'angular', 'solid', 'svelte']) {
  test(framework + ': readable custom equality -> stable values and lifecycle cleanup in Chromium', { timeout: 15000 }, async () => {
    const page = await browser.newPage();
    try {
      await page.goto(origin);
      const result = await page.evaluate(async framework => {
        const fixture = await import('/selectors.js');
        return fixture.scoped(framework);
      }, framework);

      assert.deepEqual(result, { stable: true, skipped: 0, changed: 2, active: 1, exposed: [], remaining: 0, stopped: 2, notifications: 1 });
    } finally {
      await page.close();
    }
  });
}

for (const readonly of [false, true]) {
  test('React: ' + (readonly ? 'readable' : 'writable') + ' StrictMode binding -> selector and equality replacement stays fresh', { timeout: 15000 }, async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(origin);
      const result = await page.evaluate(async readonly => {
        const fixture = await import('/selectors.js');
        return fixture.reactLifecycle(readonly);
      }, readonly);

      assert.deepEqual(result, { skipped: true, stable: true, replacementEquality: true, label: 'changed', count: 30, text: '30:changed', stableWriter: true, active: 1, remaining: 0, exposed: readonly ? [] : ['writeOnly'] });
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });
}
