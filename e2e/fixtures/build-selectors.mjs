import { fileURLToPath } from 'node:url';

const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL('./selectors.js', import.meta.url))],
  target: 'browser',
  alias: { react: fileURLToPath(new URL('../../node_modules/react', import.meta.url)) },
  define: { 'process.env.NODE_ENV': JSON.stringify('development') },
});
if (!result.success) throw new AggregateError(result.logs, 'Selector browser bundle failed');
await Bun.write(process.argv[2], result.outputs[0]);
