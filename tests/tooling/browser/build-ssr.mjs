import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { compile } from 'svelte/compiler';

const requireSsr = createRequire(new URL('../../fixtures/browser/ssr/package.json', import.meta.url));

for (const target of ['node', 'browser']) {
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL('../../fixtures/browser/ssr/' + (target === 'node' ? 'server' : 'client') + '.js', import.meta.url))],
    target,
    conditions: target === 'node' ? ['node'] : ['browser'],
    alias: {
      react: fileURLToPath(new URL('../../../node_modules/react', import.meta.url)),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('development'),
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true',
    },
    plugins: [{
      name: 'isolated-angular-ssr',
      setup(build) {
        // Resolve every Angular entry, including primitives, into one private peer context.
        build.onResolve({ filter: /^@angular\// }, ({ path }) => ({
          path: realpathSync(requireSsr.resolve(path)),
        }));
      },
    }, {
      name: 'svelte-ssr-fixture',
      setup(build) {
        build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
          contents: compile(await readFile(path, 'utf8'), {
            filename: path,
            generate: target === 'node' ? 'server' : 'client',
            dev: true,
          }).js.code,
          loader: 'js',
        }));
      },
    }],
  });
  if (!result.success) throw new AggregateError(result.logs, 'SSR fixture bundle failed');
  await Bun.write(join(process.argv[2], target + '.mjs'), result.outputs[0]);
}
