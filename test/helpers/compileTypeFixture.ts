import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import ts from 'typescript';

export type CompileTypeFixtureResult =
  | {
      readonly diagnostics: '';
      readonly exitCode: 0;
      readonly success: true;
    }
  | {
      readonly diagnostics: string;
      readonly exitCode: 1;
      readonly success: false;
    };

type CompileTypeFixtureOptions = {
  readonly configPath?: string;
  readonly fixtureRoot?: string;
};

type ParsedConfigCache = {
  readonly config: ts.ParsedCommandLine;
  readonly source: string;
};

const defaultFixtureRoot = join(import.meta.dir, '..', 'fixtures', 'pipe-types');
const parsedConfigs = new Map<string, ParsedConfigCache>();
const diagnosticHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => '',
  getNewLine: () => '\n',
};

function failure(diagnostics: string): CompileTypeFixtureResult {
  return { diagnostics, exitCode: 1, success: false };
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnostics(diagnostics, diagnosticHost).replaceAll('\r\n', '\n').trim();
}

function parseConfig(configPath: string): ts.ParsedCommandLine | CompileTypeFixtureResult {
  if (!existsSync(configPath)) {
    return failure(`Type fixture error TF1003: Shared config not found: ${configPath}`);
  }

  const source = readFileSync(configPath, 'utf8');
  const cached = parsedConfigs.get(configPath);
  if (cached?.source === source) {
    return cached.config;
  }

  const parsedText = ts.parseConfigFileTextToJson(configPath, source);
  if (parsedText.error !== undefined) {
    return failure(formatDiagnostics([parsedText.error]));
  }

  const config = ts.parseJsonConfigFileContent(
    parsedText.config,
    ts.sys,
    dirname(configPath),
    undefined,
    configPath,
  );
  if (config.errors.length > 0) {
    return failure(formatDiagnostics(config.errors));
  }

  parsedConfigs.set(configPath, { config, source });
  return config;
}

function fixtureIndexPath(fixtureRoot: string, fixture: string): string | CompileTypeFixtureResult {
  const segments = fixture.split('/');
  if (
    fixture.length === 0 ||
    !segments.every((segment) => /^[a-z0-9][a-z0-9-]*$/.test(segment))
  ) {
    return failure(`Type fixture error TF1002: Invalid fixture name: ${fixture}`);
  }

  const indexPath = join(fixtureRoot, fixture, 'index.ts');
  if (!existsSync(indexPath)) {
    return failure(`Type fixture error TF1001: Unknown fixture: ${fixture}`);
  }

  return indexPath;
}

export function compileTypeFixture(
  fixture: string,
  options: CompileTypeFixtureOptions = {},
): CompileTypeFixtureResult {
  const fixtureRoot = options.fixtureRoot ?? defaultFixtureRoot;
  const indexPath = fixtureIndexPath(fixtureRoot, fixture);
  if (typeof indexPath !== 'string') {
    return indexPath;
  }

  const configPath = options.configPath ?? join(fixtureRoot, 'tsconfig.json');
  const config = parseConfig(configPath);
  if ('success' in config) {
    return config;
  }

  const program = ts.createProgram({
    options: config.options,
    projectReferences: config.projectReferences,
    rootNames: [indexPath],
  });
  const diagnostics = formatDiagnostics(ts.getPreEmitDiagnostics(program));

  return diagnostics === ''
    ? { diagnostics: '', exitCode: 0, success: true }
    : failure(diagnostics);
}
