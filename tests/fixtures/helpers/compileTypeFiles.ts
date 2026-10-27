import ts from 'typescript';

export type CompileTypeFilesResult =
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

const compilerOptions: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  strict: true,
  target: ts.ScriptTarget.ESNext,
};

const diagnosticHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => '',
  getNewLine: () => '\n',
};

export function compileTypeFiles(rootNames: readonly string[]): CompileTypeFilesResult {
  const program = ts.createProgram({ options: compilerOptions, rootNames: [...rootNames] });
  const diagnostics = ts.formatDiagnostics(ts.getPreEmitDiagnostics(program), diagnosticHost)
    .replaceAll('\r\n', '\n')
    .trim();

  return diagnostics === ''
    ? { diagnostics: '', exitCode: 0, success: true }
    : { diagnostics, exitCode: 1, success: false };
}
