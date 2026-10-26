import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { cpus, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createStore } from '../dist/index.js';
import { dispose, history, memoryStorage, persist } from '../dist/middleware/index.js';
import { pipe } from '../dist/utils/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));

async function measure(run) {
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  const counts = await run();
  return {
    ...counts,
    elapsedMs: performance.now() - started,
    heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
  };
}

export async function measureBehavior(iterations) {
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new RangeError('iterations must be a positive safe integer');
  }
  const selector = await measure(() => {
    const store = createStore({ count: 0, unrelated: 0 });
    let computations = 0;
    let notifications = 0;
    const stop = store.subscribeSelector(
      state => { computations += 1; return state.count; },
      () => { notifications += 1; },
    );
    try {
      for (let i = 1; i <= iterations; i += 1) {
        store.set({ count: Math.floor(i / 10), unrelated: i });
      }
      return { computations, notifications };
    } finally {
      stop();
    }
  });
  const historyWork = await measure(() => {
    const store = pipe.use(history({ limit: 300 })).create(0);
    let notifications = 0;
    const stop = store.subscribe(() => { notifications += 1; });
    try {
      for (let i = 1; i <= iterations; i += 1) {
        store.set(i);
      }
      let undos = 0;
      let redos = 0;
      while (store.canUndo()) {
        store.undo();
        undos += 1;
      }
      while (store.canRedo()) {
        store.redo();
        redos += 1;
      }
      return { commits: iterations, undos, redos, notifications, limit: 300 };
    } finally {
      stop();
      dispose(store);
    }
  });
  const storage = await measure(async () => {
    const backing = memoryStorage();
    const counts = { reads: 0, writes: 0, removes: 0, disposals: 0, envelopeJsonBytes: 0 };
    const store = pipe.use(persist({
      key: 'benchmark',
      decode: value => typeof value === 'number' ? value : null,
      storage: () => {
        const adapter = backing();
        return {
          getItem: key => { counts.reads += 1; return adapter.getItem(key); },
          setItem: (key, value) => {
            counts.writes += 1;
            counts.envelopeJsonBytes += Buffer.byteLength(JSON.stringify(value));
            return adapter.setItem(key, value);
          },
          removeItem: key => { counts.removes += 1; return adapter.removeItem(key); },
          dispose: () => { counts.disposals += 1; adapter.dispose(); },
        };
      },
    })).create(0);
    try {
      await store.persist.rehydrate();
      // Await each actual commit to measure writes, not queue coalescing luck.
      for (let i = 1; i <= iterations; i += 1) {
        store.set(i);
        await store.persist.flush();
      }
      await store.persist.clearStorage();
    } finally {
      dispose(store);
    }
    return counts;
  });
  return { iterations, selector, history: historyWork, storage };
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.once('error', reject);
    child.once('close', code => {
      if (code !== 0) {
        reject(new Error(`${command} exited ${code}: ${stderr}`));
      } else {
        resolveRun({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

async function directoryBytes(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    bytes += entry.isDirectory() ? await directoryBytes(path) : (await stat(path)).size;
  }
  return bytes;
}

export async function measurePackage() {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const temporary = await mkdtemp(join(tmpdir(), 'ilokesto-state-benchmark-'));
  const bundles = {};
  const warnings = new Set();
  try {
    for (const [subpath, target] of Object.entries(manifest.exports)) {
      if (typeof target === 'string') {
        bundles[subpath] = { metadataBytes: (await stat(join(root, target))).size };
        continue;
      }
      const output = join(temporary, 'bundle.js');
      const result = await run('bun', [
        'build', resolve(root, target.import), '--target=browser', '--format=esm', '--minify',
        ...Object.keys(manifest.peerDependencies).map(peer => `--external=${peer}`),
        `--outfile=${output}`,
      ]);
      if (result.stderr) {
        warnings.add(result.stderr);
      }
      const buffer = await readFile(output);
      bundles[subpath] = { bytes: buffer.byteLength, gzipBytes: gzipSync(buffer, { level: 9 }).byteLength };
    }
    return {
      distBytes: await directoryBytes(join(root, 'dist')),
      manifestBytes: (await stat(join(root, 'package.json'))).size,
      bundles,
      warnings: [...warnings],
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const iterations = process.argv[2] === undefined ? 1000 : Number(process.argv[2]);
  process.stdout.write(`${JSON.stringify({
    schema: 1,
    environment: {
      node: process.version,
      bun: (await run('bun', ['--version'])).stdout,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model,
      lockfileSha256: createHash('sha256').update(await readFile(join(root, 'pnpm-lock.yaml'))).digest('hex'),
    },
    methodology: {
      selector: 'One selector, one count change per ten distinct commits; default equality.',
      history: 'Bounded 300-entry history; commit, undo all, redo all.',
      storage: 'Memory adapter, sequential flush per commit; JSON bytes are envelope estimates only.',
      bundle: 'All entry exports retained, browser ESM minified by installed Bun; optional peers external, registry store included.',
      memory: 'Observed heap delta without forced GC; noisy, not retained-size or leak evidence.',
      timing: 'Single process sample including setup and cleanup; no threshold or comparative claim.',
    },
    behavior: await measureBehavior(iterations),
    package: await measurePackage(),
  }, null, 2)}\n`);
}
