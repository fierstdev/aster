import { parseSync } from 'vite-plus';
import { JSXLowerer, encodeVLQ, finishModule } from '../../src/compiler.ts';

function exportsFrom(program) {
  const generators = [],
    stateless = [],
    callbacks = [];
  function record(name, fn, exportKey) {
    if (
      !name ||
      !['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(fn?.type)
    )
      return;
    const group = fn.generator ? generators : /^[A-Z]/.test(name) ? stateless : callbacks;
    group.push({ name, exportKey });
  }
  for (const statement of program.body) {
    if (!['ExportNamedDeclaration', 'ExportDefaultDeclaration'].includes(statement.type)) continue;
    const decl = statement.declaration;
    if (decl?.type === 'VariableDeclaration') {
      for (const item of decl.declarations) record(item.id.name, item.init, item.id.name);
    } else if (decl?.type === 'FunctionDeclaration') {
      record(
        decl.id?.name,
        decl,
        statement.type === 'ExportDefaultDeclaration' ? 'default' : decl.id?.name,
      );
    }
  }
  return { generators, stateless, callbacks };
}

// Replace each maximal JSX subtree once. Nested JSX inside JS expressions is
// visited on demand while adapting the subtree to the shared slot emitter.
function jsxRoots(node, roots) {
  if (node?.type === 'JSXElement' || node?.type === 'JSXFragment') {
    roots.push(node);
  } else if (node?.type) {
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        for (const item of child) jsxRoots(item, roots);
      } else if (child?.type) jsxRoots(child, roots);
    }
  }
}

export function compileOxc(source, options = {}) {
  const parsed = parseSync('input.jsx', source);
  if (parsed.errors.length) throw new SyntaxError(parsed.errors[0].codeframe);
  const program = parsed.program;
  const emitter = new JSXLowerer(source);
  const raw = (node) => source.slice(node.start, node.end);
  let marker = '__aster_map_';
  while (source.includes(marker)) marker += '_';
  const locations = [];
  function expression(node, mark = true) {
    const roots = [];
    jsxRoots(node, roots);
    const chunks = [];
    let start = node.start;
    for (const root of roots.sort((a, b) => a.start - b.start)) {
      chunks.push(source.slice(start, root.start), emitter.emitJSX(element(root)));
      start = root.end;
    }
    chunks.push(source.slice(start, node.end));
    const code = chunks.join('');
    if (!mark) return code;
    locations.push(node.start);
    return marker + (locations.length - 1) + '__' + code;
  }
  function element(node) {
    const opening = node.openingElement;
    const attrs = (opening?.attributes ?? []).map((attr) => {
      if (attr.type === 'JSXSpreadAttribute')
        return { name: '...', value: expression(attr.argument), isExpr: true, isSpread: true };
      const name = raw(attr.name);
      const val = attr.value;
      if (!val) return { name, value: null, isExpr: false };
      if (val.type === 'Literal') return { name, value: raw(val).slice(1, -1), isExpr: false };
      // The shared binding emitter recognizes lvalues by their literal spelling.
      return {
        name,
        value: expression(val.expression ?? val, !name.startsWith('bind:')),
        isExpr: true,
      };
    });
    const children = [];
    for (const child of node.children) {
      if (child.type === 'JSXText') {
        const text = emitter.cleanJsxText(raw(child));
        if (!text) continue;
        if (children.at(-1)?.kind === 'text') children.at(-1).text += text;
        else children.push({ kind: 'text', text });
      } else if (child.type === 'JSXExpressionContainer') {
        if (child.expression.type !== 'JSXEmptyExpression')
          children.push({ kind: 'expr', code: expression(child.expression) });
      } else if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
        children.push(element(child));
      } else throw new SyntaxError('Unsupported JSX child: ' + child.type);
    }
    return { kind: 'el', tag: opening ? raw(opening.name) : '', attrs, children };
  }

  const body = expression(program, false);
  const result = finishModule(source, options, emitter, body, exportsFrom(program));
  // Sparse proof of expression-start mappings, including multiple slots on one line.
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  const pattern = new RegExp(marker + '(\\d+)__', 'g');
  let previousLine = 0,
    previousColumn = 0;
  const mappings = [];
  result.code = result.code
    .split('\n')
    .map((line) => {
      let removed = 0,
        previousGenerated = 0;
      const segments = [];
      const clean = line.replace(pattern, (match, id, index) => {
        const offset = locations[Number(id)];
        const originalLine = starts.findLastIndex((start) => start <= offset);
        const originalColumn = offset - starts[originalLine];
        const generated = index - removed;
        segments.push(
          [
            generated - previousGenerated,
            0,
            originalLine - previousLine,
            originalColumn - previousColumn,
          ]
            .map(encodeVLQ)
            .join(''),
        );
        previousGenerated = generated;
        previousLine = originalLine;
        previousColumn = originalColumn;
        removed += match.length;
        return '';
      });
      mappings.push(segments.join(','));
      return clean;
    })
    .join('\n');
  result.map.mappings = mappings.join(';');
  return result;
}
