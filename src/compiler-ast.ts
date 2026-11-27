import type { Node, Program, JSXElement, JSXFragment } from 'oxc-parser';
import {
  SlotEmitter,
  emitModule,
  type CompileOptions,
  type CompileResult,
  type JSXEl,
} from './compiler.ts';
import { SourceRanges } from './compiler-map.ts';

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

type Scope = { parent?: Scope; vars: Map<string, 'mutable' | 'readonly' | 'primitive'> };
function bindingScopes(program: Program, keys: (node: Node) => readonly string[]) {
  const at = new WeakMap<Node, Scope>();
  function declare(pattern: Node, scope: Scope, kind: 'mutable' | 'readonly' | 'primitive') {
    switch (pattern.type) {
      case 'Identifier':
        scope.vars.set(pattern.name, kind);
        break;
      case 'RestElement':
        declare(pattern.argument, scope, kind);
        break;
      case 'AssignmentPattern':
        declare(pattern.left, scope, kind);
        break;
      case 'ArrayPattern':
        for (const el of pattern.elements) if (el) declare(el, scope, kind);
        break;
      case 'ObjectPattern':
        for (const p of pattern.properties)
          declare(p.type === 'RestElement' ? p.argument : p.value, scope, kind);
        break;
    }
  }
  function walk(node: Node, scope: Scope, fnScope: Scope) {
    if (!node?.type) return;
    switch (node.type) {
      case 'FunctionDeclaration':
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        if (node.type === 'FunctionDeclaration' && node.id) declare(node.id, scope, 'mutable');
        scope = { parent: scope, vars: new Map() };
        if (node.type === 'FunctionExpression' && node.id) declare(node.id, scope, 'readonly');
        for (const p of node.params) {
          declare(p, scope, 'mutable');
          walk(p, scope, scope);
        }
        // Body var declarations are invisible to default parameter expressions.
        if (node.body) {
          const bodyScope = { parent: scope, vars: new Map() };
          walk(node.body, bodyScope, bodyScope);
        }
        return;
      case 'SwitchStatement': {
        walk(node.discriminant, scope, fnScope);
        const cases = { parent: scope, vars: new Map() };
        for (const clause of node.cases) walk(clause, cases, fnScope);
        return;
      }
      case 'TSModuleBlock':
      case 'StaticBlock':
        scope = { parent: scope, vars: new Map() };
        fnScope = scope;
        break;
      case 'CatchClause':
      case 'BlockStatement':
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'ClassExpression':
      case 'ClassDeclaration':
        scope = { parent: scope, vars: new Map() };
        if (node.type === 'CatchClause' && node.param) declare(node.param, scope, 'mutable');
        if ((node.type === 'ClassDeclaration' || node.type === 'ClassExpression') && node.id) {
          if (node.type === 'ClassDeclaration') declare(node.id, scope.parent!, 'mutable');
          declare(node.id, scope, 'readonly');
        }
        break;
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
        declare(node.local, scope, 'readonly');
        break;
      case 'VariableDeclaration':
        for (const d of node.declarations)
          declare(
            d.id,
            node.kind === 'var' ? fnScope : scope,
            node.kind === 'let' || node.kind === 'var'
              ? 'mutable'
              : d.id.type === 'Identifier' && isScalar(unwrap(d.init))
                ? 'primitive'
                : 'readonly',
          );
        break;
      case 'JSXAttribute':
        at.set(node, scope);
        break;
    }
    const fields = node as unknown as Record<string, Node | Node[]>;
    for (const key of keys(node)) {
      const field = fields[key];
      if (Array.isArray(field)) {
        for (const child of field) if (child?.type) walk(child, scope, fnScope);
      } else if (field?.type) walk(field, scope, fnScope);
    }
  }
  const root = { vars: new Map() };
  walk(program, root, root);
  return (attr: Node, name: string) => {
    for (let s = at.get(attr); s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name);
  };
}

function isScalar(node: Node | null) {
  return (
    node?.type === 'Literal' ||
    node?.type === 'TemplateLiteral' ||
    node?.type === 'UnaryExpression' ||
    node?.type === 'BinaryExpression' ||
    node?.type === 'UpdateExpression'
  );
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

export function compileProgram(
  source: string,
  options: CompileOptions,
  program: Program,
  keys: (node: Node) => readonly string[],
): CompileResult {
  const filename = options.sourceFile ?? options.moduleUrl ?? 'input.tsx';
  const lookup = source.includes('bind:') ? bindingScopes(program, keys) : undefined;
  const emitter = new SlotEmitter(source);
  const ranges = new SourceRanges(source, options.runtimeImport ?? '');
  let isEntry = false;
  function expression(node: Node) {
    const chunks: string[] = [];
    let cursor = node.start;
    function visit(current: Node) {
      if (!current?.type) return;
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
      for (const key of keys(current)) {
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
      const binding = ['bind:value', 'bind:checked', 'bind:open'].includes(name);
      function invalid(at: Node): never {
        const lines = source.slice(0, at.start).split('\n');
        throw new SyntaxError(
          `${filename}:${lines.length}:${lines.at(-1)!.length + 1}: ${name} needs a writable variable, property, signal, or [get, set] pair.`,
        );
      }
      if (binding && (!value || value.type === 'Literal')) invalid(value ?? attr);
      if (!value) return { name, value: null, isExpr: false };
      if (value.type === 'Literal') return { name, value: raw(value).slice(1, -1), isExpr: false };
      let expr: Node = value.type === 'JSXExpressionContainer' ? value.expression : value;
      const target = unwrap(expr);
      const kind =
        binding && target?.type === 'Identifier' ? lookup?.(attr, target.name) : undefined;
      if (binding && (isScalar(target) || kind === 'primitive')) invalid(expr);
      const bindable =
        (target?.type === 'Identifier' && kind !== 'readonly') ||
        target?.type === 'MemberExpression';
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

export function maskOpeningComment(
  input: string,
  close: number,
  comments: { start: number; end: number }[],
) {
  if (input[close] !== '}') return;
  let cursor = close;
  let foundComment = false;
  for (const comment of comments.reverse()) {
    if (comment.end > cursor) continue;
    if (input.slice(comment.end, cursor).trim()) break;
    foundComment = true;
    cursor = comment.start;
  }
  while (cursor && /\s/.test(input[cursor - 1])) cursor--;
  if (foundComment && input[cursor - 1] === '{') {
    return (
      input.slice(0, cursor - 1) + ' ' + input.slice(cursor, close) + ' ' + input.slice(close + 1)
    );
  }
}
