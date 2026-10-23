import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveInstalledPackage } from '../../scripts/docs-runtime.mjs';
import { scopeDevelopmentLink, getDocsChannel, publishedPackages } from '../lib/publication.ts';
import { publicPackageNames, rewriteDocsLink, rewriteMarkdownLinks } from '../lib/docs-links.ts';

test('released State: pinned npm runtime -> real persisted round trip', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const installed = await resolveInstalledPackage('@ilokesto/released-state', path.join(root, 'docs-publication/runtime'));
  assert.equal(installed.manifest.version, publishedPackages.state.version);
  assert.ok(installed.directory.startsWith(path.join(root, 'node_modules')));
  const middleware = await import(pathToFileURL(path.join(installed.directory, 'dist/middleware/index.js')).href);
  const utils = await import(pathToFileURL(path.join(installed.directory, 'dist/utils/index.js')).href);
  const { dispose, jsonStorage, persist } = middleware;
  const { pipe } = utils;
  const entries = new Map();
  const memory = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, String(value)); },
    removeItem: key => { entries.delete(key); },
  };
  const make = () => pipe.use(persist({
    key: 'editor',
    storage: jsonStorage(() => memory),
    decode: value => value,
  })).create({ count: 0 });

  const first = make();
  await first.persist.rehydrate();
  first.set({ count: 7 });
  await first.persist.flush();
  dispose(first);

  const second = make();
  await second.persist.rehydrate();
  assert.deepEqual(second.getState(), { count: 7 });
  assert.equal(entries.size, 1);
  assert.deepEqual(JSON.parse(entries.get('editor')), { state: { count: 7 }, version: 0 });
  dispose(second);
});

test('development links: complete public classification -> locale and channel preserved', () => {
  assert.equal(publicPackageNames.length, 8);
  for (const name of publicPackageNames) {
    const host = name === 'state' ? '' : 'https://ilokesto.ayden94.com';
    assert.equal(scopeDevelopmentLink(`/en/${name}/quick-start#install`), `${host}/en/${name}/next/quick-start#install`);
    assert.equal(scopeDevelopmentLink(`/ko/${name}?x=1`), `${host}/ko/${name}/next?x=1`);
    assert.equal(scopeDevelopmentLink(`/en/${name}/next/quick-start`), `${host}/en/${name}/next/quick-start`);
    assert.equal(rewriteDocsLink(`/ko/${name}/next/core-concepts`, false, 'state'), `${host}/ko/${name}/next/core-concepts`);
  }
  assert.equal(getDocsChannel(['state']), 'released');
  assert.equal(getDocsChannel(['state', 'next']), 'next');
  assert.equal(getDocsChannel(['modal', 'next']), undefined);
  assert.equal(scopeDevelopmentLink('https://example.com/en/store'), 'https://example.com/en/store');
  assert.equal(scopeDevelopmentLink('../reference/store'), '../reference/store');
  assert.equal(scopeDevelopmentLink('/en/queryable'), '/en/queryable');
  assert.equal(scopeDevelopmentLink('/en/unknown'), '/en/unknown');
});

test('Markdown links: prose versus code -> only real link destinations change', () => {
  const code = '```ts\nconst link = "[Overlay](/ko/overlay)";\n```\n';
  const inline = '`[Overlay](/ko/overlay)` and ``const x = `[/en/overlay](/en/overlay)`;``\n';
  const markdown = '[Overlay](/ko/overlay#provider) [Self](/en/modal/core-concepts)\n'
    + '[overlay]: /en/overlay/next/core-concepts\n' + code + inline;

  const output = rewriteMarkdownLinks(markdown, true, 'modal');

  assert.ok(output.includes('[Overlay](https://ilokesto.ayden94.com/ko/overlay/next#provider)'));
  assert.ok(output.includes('[Self](/en/modal/next/core-concepts)'));
  assert.ok(output.includes('[overlay]: https://ilokesto.ayden94.com/en/overlay/next/core-concepts'));
  assert.ok(output.endsWith(code + inline));
  const multiline = '`example\n[Overlay](/ko/overlay)\n`';
  assert.equal(rewriteMarkdownLinks(multiline, true, 'modal'), multiline);
  const fenced = '```md\n```typescript\n[Overlay](/ko/overlay)\n```\n';
  assert.equal(rewriteMarkdownLinks(fenced, true, 'modal'), fenced);
});

test('source links: current versus archived revision -> owning successor paths', () => {
  const old = 'https://github.com/ilokesto/ilokesto';
  assert.equal(rewriteDocsLink(`${old}/tree/main/packages/state/src`, true, 'state'),
    'https://github.com/ilokesto/state/tree/main/src');
  const sha = 'e'.repeat(40);
  assert.equal(rewriteDocsLink(`${old}/blob/${sha}/packages/state/src/core.ts`, false, 'state'),
    `https://github.com/ilokesto/state/blob/${sha}/packages/state/src/core.ts`);
});
