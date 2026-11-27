import {
  parseSync,
  visitorKeys,
  type Node,
  type Program,
  type JSXElement,
  type JSXFragment,
} from 'oxc-parser';
import {
  SlotEmitter,
  emitModule,
  type CompileOptions,
  type CompileResult,
  type JSXEl,
} from './compiler.ts';
import { SourceRanges } from './compiler-map.ts';

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
      let cursor = close;
      let foundComment = false;
      for (const comment of parsed.comments.reverse()) {
        if (comment.end > cursor) continue;
        if (input.slice(comment.end, cursor).trim()) break;
        foundComment = true;
        cursor = comment.start;
      }
      while (cursor && /\s/.test(input[cursor - 1])) cursor--;
      if (foundComment && input[cursor - 1] === '{') {
        input =
          input.slice(0, cursor - 1) +
          ' ' +
          input.slice(cursor, close) +
          ' ' +
          input.slice(close + 1);
        continue;
      }
    }
    throw new SyntaxError(error.codeframe ?? error.message);
  }
}

function unwrap(node: Node | null) {
  while (
    node &&
    (node.type === 'ParenthesizedExpression' ||
      node.type === 'TSAsExpression' ||
      node.type === 'TSSatisfiesExpression' ||
      node.type === 'TSNonNullExpression')
  )
    node = node.expression;
  return node;
}

function componentExports(program: Program) {
  type Entry = { name: string; exportKey: string };
  const generators: Entry[] = [],
    stateless: Entry[] = [],
    callbacks: Entry[] = [];
  function record(name: string, fn: Node | null, exportKey = name) {
    fn = unwrap(fn);
    if (
      !fn ||
      (fn.type !== 'ArrowFunctionExpression' &&
        fn.type !== 'FunctionExpression' &&
        fn.type !== 'FunctionDeclaration') ||
      !fn.body
    )
      return;
    const group = fn.generator
      ? generators
      : /^[A-Z]/.test(name) || /^[A-Z]/.test(exportKey)
        ? stateless
        : callbacks;
    group.push({ name, exportKey });
  }
  const declarations = new Map<string, Node | null>();
  const exports = new Map<string, string>();
  for (const stmt of program.body) {
    const direct =
      stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration';
    const decl = direct ? stmt.declaration : stmt;
    function declare(name: string, fn: Node | null) {
      declarations.set(name, fn);
      if (direct) exports.set(name, stmt.type === 'ExportDefaultDeclaration' ? 'default' : name);
    }
    if (decl?.type === 'VariableDeclaration') {
      for (const item of decl.declarations)
        if (item.id.type === 'Identifier') declare(item.id.name, item.init);
    } else if (decl?.type === 'FunctionDeclaration' && decl.id) {
      declare(decl.id.name, decl);
    } else if (stmt.type === 'ExportDefaultDeclaration' && decl?.type === 'Identifier') {
      exports.set(decl.name, 'default');
    } else if (
      stmt.type === 'ExportNamedDeclaration' &&
      !stmt.source &&
      stmt.exportKind !== 'type'
    ) {
      for (const spec of stmt.specifiers) {
        if (
          spec.exportKind === 'type' ||
          spec.local.type !== 'Identifier' ||
          exports.has(spec.local.name)
        )
          continue;
        exports.set(
          spec.local.name,
          spec.exported.type === 'Identifier' ? spec.exported.name : spec.exported.value,
        );
      }
    }
  }
  for (const [name, key] of exports) record(name, declarations.get(name) ?? null, key);
  return { generators, stateless, callbacks };
}

export function compileModule(source: string, options: CompileOptions = {}): CompileResult {
  const filename = options.sourceFile ?? options.moduleUrl ?? 'input.tsx';
  const program = parse(source, filename);
  const emitter = new SlotEmitter(source);
  const ranges = new SourceRanges(source, options.runtimeImport ?? '');
  let isEntry = false;
  function expression(node: Node) {
    const chunks: string[] = [];
    let cursor = node.start;
    function visit(current: Node) {
      if (current.type === 'JSXElement' || current.type === 'JSXFragment') {
        chunks.push(ranges.copy(cursor, current.start), emitter.emitJSX(element(current)));
        cursor = current.end;
        return;
      }
      if (
        current.type === 'CallExpression' &&
        current.callee.type === 'Identifier' &&
        current.callee.name === 'render'
      )
        isEntry = true;
      const fields = current as unknown as Record<string, Node | Node[] | null>;
      for (const key of visitorKeys[current.type] ?? []) {
        const field = fields[key];
        if (Array.isArray(field))
          field.forEach((child) => {
            if (child) visit(child);
          });
        else if (field) visit(field);
      }
    }
    visit(node);
    chunks.push(ranges.copy(cursor, node.end));
    return chunks.join('');
  }
  function element(node: JSXElement | JSXFragment): JSXEl {
    const opening = node.type === 'JSXElement' ? node.openingElement : null;
    const raw = (n: Node) => source.slice(n.start, n.end);
    const tag = opening ? raw(opening.name) : '';
    const attrs = (opening?.attributes ?? []).map((attr) => {
      if (attr.type === 'JSXSpreadAttribute')
        return { name: '...', value: expression(attr.argument), isExpr: true, isSpread: true };
      const name = raw(attr.name),
        value = attr.value;
      if (!value) return { name, value: null, isExpr: false };
      if (value.type === 'Literal') return { name, value: raw(value).slice(1, -1), isExpr: false };
      let expr: Node = value.type === 'JSXExpressionContainer' ? value.expression : value;
      const target = unwrap(expr);
      const bindable = target?.type === 'Identifier' || target?.type === 'MemberExpression';
      if (name.startsWith('bind:') && bindable) expr = target;
      return { name, value: expression(expr), bindable, isExpr: true };
    });
    const children: JSXEl['children'] = [];
    for (const child of node.children) {
      if (child.type === 'JSXText') {
        const text = emitter.cleanJsxText(raw(child));
        if (!text) continue;
        const previous = children.at(-1);
        if (previous?.kind === 'text') previous.text += text;
        else children.push({ kind: 'text', text });
      } else if (child.type === 'JSXExpressionContainer') {
        if (child.expression.type !== 'JSXEmptyExpression')
          children.push({ kind: 'expr', code: expression(child.expression) });
      } else if (child.type === 'JSXSpreadChild') {
        throw new SyntaxError(`Unsupported JSX spread child in ${filename}`);
      } else children.push(element(child));
    }
    const reference =
      opening && emitter.isComponentTag(tag)
        ? ranges.copy(opening.name.start, opening.name.end)
        : undefined;
    return { kind: 'el', tag, reference, attrs, children };
  }
  const body = expression(program);
  const emitted = emitModule(options, emitter, body, componentExports(program), isEntry);
  const { code, mappings } = ranges.expand(emitted.code);
  return {
    code,
    map: { version: 3, sources: [filename], sourcesContent: [source], names: [], mappings },
    exportedCallbacks: emitted.exportedCallbacks,
    exportedStateless: emitted.exportedStateless,
    exportedGenerators: emitted.exportedGenerators,
  };
}
