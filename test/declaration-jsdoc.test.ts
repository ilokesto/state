import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';

type PublicDeclaration = Readonly<{
  readonly exportName: string;
  readonly relativePath: string;
}>;

const projectRoot = join(import.meta.dir, '..');
const publicDeclarations = [
  { exportName: 'create', relativePath: 'core/React/index.d.ts' },
  { exportName: 'create', relativePath: 'core/Vue/index.d.ts' },
  { exportName: 'create', relativePath: 'core/Angular/index.d.ts' },
  { exportName: 'create', relativePath: 'core/Svelte/index.d.ts' },
  { exportName: 'create', relativePath: 'core/Solid/index.d.ts' },
  { exportName: 'persist', relativePath: 'middleware/persist/index.d.ts' },
  { exportName: 'definePipeableMiddleware', relativePath: 'utils/pipe/metadata.d.ts' },
  { exportName: 'throttle', relativePath: 'middleware/throttle.d.ts' },
  { exportName: 'adaptor', relativePath: 'utils/adaptor.d.ts' },
] as const satisfies readonly PublicDeclaration[];

test('Given an isolated declaration build, When public declarations are emitted, Then framework and middleware utility exports retain JSDoc', () => {
  // Given
  const declarationDirectory = mkdtempSync(join(tmpdir(), 'ilokesto-state-declarations-'));

  try {
    const build = Bun.spawnSync({
      cmd: [
        'pnpm',
        'exec',
        'tsc',
        '--outDir',
        declarationDirectory,
        '--declarationDir',
        declarationDirectory,
      ],
      cwd: projectRoot,
    });

    // When
    expect(build.exitCode).toBe(0);
    const declarations = publicDeclarations.map((declaration) => {
      const declarationPath = join(declarationDirectory, declaration.relativePath);
      const sourceFile = ts.createSourceFile(
        declarationPath,
        readFileSync(declarationPath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const functions = sourceFile.statements.filter(
        (statement): statement is ts.FunctionDeclaration =>
          ts.isFunctionDeclaration(statement) &&
          statement.name?.text === declaration.exportName &&
          statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true,
      );

      if (functions.length === 0) {
        throw new Error(`Missing exported declaration: ${declaration.relativePath}#${declaration.exportName}`);
      }

      return functions;
    });

    // Then
    for (const declarationsForExport of declarations) {
      for (const declaration of declarationsForExport) {
        expect(ts.getJSDocCommentsAndTags(declaration).length).toBeGreaterThan(0);
      }
    }
  } finally {
    rmSync(declarationDirectory, { force: true, recursive: true });
  }
}, { timeout: 180_000 });
