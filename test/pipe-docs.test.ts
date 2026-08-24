import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { compileTypeFiles } from './helpers/compileTypeFiles';

type PipeExample = {
  readonly code: string;
  readonly id: string;
};

type Marker = {
  readonly end: number;
  readonly id: string;
};

type CompilerRun = {
  readonly diagnostics: string;
  readonly exitCode: number;
};

type DocumentExamples = {
  readonly examples: readonly PipeExample[];
  readonly language: 'en' | 'ko';
};

const requiredMiddlewareExampleIds = [
  'history-pipe',
  'throttle-pipe',
  'dispose-store',
  'safe-persist-pipe',
] as const;

const projectRoot = join(import.meta.dir, '..');
const readmePath = join(projectRoot, 'README.md');
const koreanReadmePath = join(projectRoot, 'README.ko.md');

function extractMarkedPipeExamples(markdown: string, documentName: string): readonly PipeExample[] {
  const markers = new Map<string, Marker>();
  const markerComments = /<!--\s*pipe-example:([\s\S]*?)-->/g;

  for (const match of markdown.matchAll(markerComments)) {
    const rawId = match[1];
    const index = match.index;
    const id = rawId?.trim();
    if (id === undefined || index === undefined || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error('Each pipe example marker must use a stable lowercase kebab-case ID');
    }
    if (markers.has(id)) {
      throw new Error(`Duplicate pipe example marker: ${id}`);
    }

    markers.set(id, { end: index + match[0].length, id });
  }

  const examples: PipeExample[] = [];
  const usedMarkers = new Set<string>();
  const fences = /```(?:ts|typescript)\r?\n([\s\S]*?)```/g;

  for (const match of markdown.matchAll(fences)) {
    const code = match[1];
    const index = match.index;
    if (code === undefined || index === undefined) {
      throw new Error('TypeScript fence extraction failed');
    }

    const marker = [...markers.values()].find(
      (candidate) => candidate.end <= index && markdown.slice(candidate.end, index).trim().length === 0,
    );
    const usesDocumentedMiddleware = code.includes("from '@ilokesto/state/middleware'");
    const usesPipeContract =
      code.includes("from '@ilokesto/state/utils'") &&
      (code.includes('pipe') || code.includes('definePipeableMiddleware'));

    if ((usesDocumentedMiddleware || usesPipeContract) && marker === undefined) {
      throw new Error(`Each ${documentName} middleware or pipe TypeScript fence must have a pipe-example marker`);
    }
    if (marker !== undefined) {
      examples.push({ code, id: marker.id });
      usedMarkers.add(marker.id);
    }
  }

  for (const marker of markers.values()) {
    if (!usedMarkers.has(marker.id)) {
      throw new Error(`Pipe example marker ${marker.id} must immediately precede a TypeScript fence`);
    }
  }
  if (examples.length === 0) {
    throw new Error(`${documentName} must contain marked pipe examples`);
  }

  return examples;
}

function assertRequiredMiddlewareExamples(examples: readonly PipeExample[], documentName: string): void {
  const ids = new Set(examples.map((example) => example.id));

  for (const id of requiredMiddlewareExampleIds) {
    if (!ids.has(id)) {
      throw new Error(`${documentName} must contain middleware example marker: ${id}`);
    }
  }
}

function assertNoHistoryWithDelayedMiddleware(markdown: string, documentName: string): void {
  const fences = /```(?:ts|typescript)\r?\n([\s\S]*?)```/g;

  for (const match of markdown.matchAll(fences)) {
    const code = match[1];
    if (code !== undefined && /\bhistory\b/.test(code) && /\b(?:debounce|throttle)\b/.test(code)) {
      throw new Error(
        `${documentName} must not present history with debounce or throttle in one TypeScript example`,
      );
    }
  }
}

function compileExamples(documents: readonly DocumentExamples[]): CompilerRun {
  const temporaryProject = mkdtempSync(join(tmpdir(), 'ilokesto-state-pipe-docs-'));

  try {
    const packageDirectory = join(temporaryProject, 'node_modules', '@ilokesto');
    const packageLink = join(packageDirectory, 'state');
    mkdirSync(packageDirectory, { recursive: true });
    symlinkSync(projectRoot, packageLink, 'dir');
    writeFileSync(join(temporaryProject, 'package.json'), '{"type":"module"}\n');
    const sourcePaths = documents.flatMap(({ examples, language }) =>
      examples.map((example) => {
        const sourcePath = join(temporaryProject, `${language}-${example.id}.ts`);
        writeFileSync(sourcePath, example.code);
        return sourcePath;
      }),
    );
    const result = compileTypeFiles(sourcePaths);

    return { diagnostics: result.diagnostics, exitCode: result.exitCode };
  } finally {
    rmSync(temporaryProject, { force: true, recursive: true });
  }
}

test('Given marked bilingual pipe examples and a fresh package build, when compiled, then every example has no diagnostics', () => {
  // Given
  const englishExamples = extractMarkedPipeExamples(readFileSync(readmePath, 'utf8'), 'English README');
  const koreanExamples = extractMarkedPipeExamples(readFileSync(koreanReadmePath, 'utf8'), 'Korean README');
  assertRequiredMiddlewareExamples(englishExamples, 'English README');
  assertRequiredMiddlewareExamples(koreanExamples, 'Korean README');
  assertNoHistoryWithDelayedMiddleware(readFileSync(readmePath, 'utf8'), 'English README');
  assertNoHistoryWithDelayedMiddleware(readFileSync(koreanReadmePath, 'utf8'), 'Korean README');

  // When
  const result = compileExamples([
    { examples: englishExamples, language: 'en' },
    { examples: koreanExamples, language: 'ko' },
  ]);
  expect(result.exitCode, result.diagnostics).toBe(0);
  expect(result.diagnostics).toBe('');
}, { timeout: 180_000 });

test('Given marked Korean pipe examples, when checked, then includes required middleware examples without delayed history', () => {
  // Given
  const examples = extractMarkedPipeExamples(readFileSync(koreanReadmePath, 'utf8'), 'Korean README');
  assertRequiredMiddlewareExamples(examples, 'Korean README');
  assertNoHistoryWithDelayedMiddleware(readFileSync(koreanReadmePath, 'utf8'), 'Korean README');

  // When / Then
  expect(examples).toHaveLength(requiredMiddlewareExampleIds.length + 2);
}, { timeout: 180_000 });

test('Given bilingual pipe documentation, when their marked examples are compared, then documents equivalent bilingual pipe contracts', () => {
  // Given
  const englishExamples = extractMarkedPipeExamples(readFileSync(readmePath, 'utf8'), 'English README');
  const koreanExamples = extractMarkedPipeExamples(readFileSync(koreanReadmePath, 'utf8'), 'Korean README');

  // When / Then
  expect(koreanExamples.map((example) => example.id).sort()).toEqual(
    englishExamples.map((example) => example.id).sort(),
  );
}, { timeout: 20_000 });

test('Given malformed middleware documentation, when examples are checked, then malformed, missing, duplicate, and delayed history markers fail', () => {
  // Given / When / Then
  expect(() => extractMarkedPipeExamples("```ts\nimport { pipe } from '@ilokesto/state/utils';\npipe;\n```", 'English README'))
    .toThrow('Each English README middleware or pipe TypeScript fence must have a pipe-example marker');
  expect(() => extractMarkedPipeExamples('<!-- pipe-example:Malformed_ID -->\n```ts\nconst marker = 1;\n```', 'English README'))
    .toThrow('Each pipe example marker must use a stable lowercase kebab-case ID');
  expect(() => assertRequiredMiddlewareExamples([], 'English README')).toThrow(
    'English README must contain middleware example marker: history-pipe',
  );
  expect(() => extractMarkedPipeExamples('<!-- pipe-example:duplicate -->\n```ts\nconst a = 1;\n```\n<!-- pipe-example:duplicate -->\n```ts\nconst b = 2;\n```', 'English README'))
    .toThrow('Duplicate pipe example marker: duplicate');
  expect(() => assertNoHistoryWithDelayedMiddleware("```ts\nimport { history, throttle } from '@ilokesto/state/middleware';\nimport { pipe } from '@ilokesto/state/utils';\npipe.use(history()).use(throttle(100)).create({ count: 0 });\n```", 'English README'))
    .toThrow('English README must not present history with debounce or throttle in one TypeScript example');
}, { timeout: 20_000 });
