import { parseSync, visitorKeys } from 'oxc-parser';
import { compileProgram, maskOpeningComment } from './compiler-ast.ts';
import type { CompileOptions } from './compiler.ts';
function parse(source: string, filename: string) {
  let input = source;
  for (;;) {
    const parsed = parseSync(filename, input, { lang: filename.endsWith('.jsx') ? 'jsx' : 'tsx' });
    const error = parsed.errors[0];
    if (!error) return parsed.program;

    // In a JSX opening tag Oxc expects a spread after "{". Recover only
    // when its own lexer found exclusively comments between these braces.
    const close = error.labels[0]?.start;
    if (error.message === 'Expected `...` but found `}`' && input[close] === '}') {
      const repaired = maskOpeningComment(input, close, parsed.comments);
      if (repaired) {
        input = repaired;
        continue;
      }
    }
    throw new SyntaxError(error.codeframe ?? error.message);
  }
}

export function compileModule(source: string, options: CompileOptions = {}) {
  const program = parse(source, options.sourceFile ?? options.moduleUrl ?? 'input.tsx');
  return compileProgram(source, options, program, (node) => visitorKeys[node.type] ?? []);
}
