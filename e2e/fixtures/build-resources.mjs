import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL('./resources.js', import.meta.url))],
  target: 'browser',
  alias: { react: fileURLToPath(new URL('../../node_modules/react', import.meta.url)) },
  define: { 'process.env.NODE_ENV': JSON.stringify('development') },
  plugins: [{
    name: 'svelte-resource-fixture',
    setup(build) {
      build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
        const source = await readFile(path, 'utf8');
        return { contents: compile(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
      });
    },
  }],
});
if (!result.success) throw new AggregateError(result.logs, 'Resource browser bundle failed');
await Bun.write(process.argv[2], result.outputs[0]);
