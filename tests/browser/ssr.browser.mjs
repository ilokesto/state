import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';

let directory;
let server;
let browser;
let origin;
let renderer;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'state-ssr-'));
  await promisify(execFile)('bun', ['run', new URL('../tooling/browser/build-ssr.mjs', import.meta.url).pathname, directory]);
  renderer = await import(pathToFileURL(join(directory, 'node.mjs')).href);
  const client = await readFile(join(directory, 'browser.mjs'));
  server = createServer(async (request, response) => {
    try {
      if (request.url === '/client.mjs') {
        response.writeHead(200, { 'content-type': 'text/javascript' }).end(client);
        return;
      }
      const url = new URL(request.url, 'http://localhost');
      const { html } = await renderer.render(url.pathname.slice(1), Number(url.searchParams.get('count')));
      response.writeHead(200, { 'content-type': 'text/html' }).end(html);
    } catch (error) {
      response.writeHead(500).end(String(error.stack));
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

test('React SSR: current state changed -> renderer and payload retain the initial snapshot', () => {
  const result = renderer.reactInitialSnapshot();

  assert.equal(result.html, '<output>1</output>');
  assert.deepEqual(JSON.parse(result.payload), { version: 1, state: { count: 1, label: 'initial' } });
});

for (const framework of ['react', 'vue', 'angular', 'svelte', 'solid']) {
  test(framework + ': concurrent SSR requests -> matching Chromium hydration, borrowed ownership, cleanup and remount', { timeout: 30000 }, async () => {
    const pages = await Promise.all([browser.newPage(), browser.newPage()]);
    try {
      const results = await Promise.all(pages.map(async (page, index) => {
        const count = index + 1;
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error' || /hydration.*mismatch|hydration failed/i.test(message.text())) {
            errors.push(message.text());
          }
        });
        const response = await page.goto(origin + '/' + framework + '?count=' + count);
        assert.equal(response.status(), 200, await response.text());
        assert.equal(await page.locator('output').textContent(), String(count));
        const result = await page.evaluate(async framework => {
          const fixture = await import('/client.mjs');
          return fixture.exercise(framework);
        }, framework);
        assert.deepEqual(errors, []);
        return result;
      }));

      for (const [index, result] of results.entries()) {
        assert.deepEqual(result, {
          initial: String(index + 1), hydrated: String(index + 1), reused: true,
          active: 1, borrowedAlive: true, updated: String(index + 11),
          replaced: framework === 'react' ? 'updated' : null,
          remaining: 0, remounted: 'updated', repeatedUpdate: 'again',
          finalSubscriptions: 0, cleaned: 1, errors: [],
        });
      }
    } finally {
      await Promise.all(pages.map(page => page.close()));
    }
  });
}
