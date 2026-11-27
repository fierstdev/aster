import { parseModule, type ParseError } from 'meriyah';
import type { Program } from 'oxc-parser';
import { compileProgram, maskOpeningComment } from '../src/compiler-ast.ts';
import type { CompileOptions } from '../src/compiler.ts';

export function compileJSX(source: string, options: CompileOptions = {}) {
  let input = source;
  for (;;) {
    const comments: { start: number; end: number }[] = [];
    let program;
    try {
      program = parseModule(input, {
        jsx: true,
        preserveParens: true,
        ranges: true,
        onComment: (_type, _text, start, end) => {
          comments.push({ start, end });
        },
      });
    } catch (error) {
      if (error instanceof SyntaxError && (error as ParseError).description === "Expected '...'") {
        const repaired = maskOpeningComment(input, (error as ParseError).start, comments);
        if (repaired) {
          input = repaired;
          continue;
        }
      }
      throw error;
    }
    // The editor accepts JavaScript. Both parsers implement ESTree + JSX.
    return compileProgram(source, options, program as unknown as Program, Object.keys).code;
  }
}
