// Aster JSX-to-Slot Compiler
// Shared slot emission for the build compiler and the playground.
// Lowers:
//   - Intrinsic JSX trees -> hoisted module-level `_tpl(html, bindings)` + `_slot(_tN, values, key)`
//   - Component JSX (`<Counter {...props} start={10} />`) -> `_comp(Counter, { ...props, start: 10 }, key)`
//   - Intrinsic spread props (`<button {...rest}>`) -> `{ kind: 'spread', path }` binding
//   - JSX comments (`{/* note */}`) -> stripped cleanly with adjacent text node merging
//   - Two-way bindings (`bind:value={draft}`) -> `[() => draft, (_v) => (draft = _v)]`
//   - Exported stateful generators (`export function* Counter`) -> automatic `Counter.__asterSrc = '...'`
//   - Optional Vite+ HMR (`hmr: true`) -> automatic `import.meta.hot.accept(...)` + `__asterHmrAccept`

export interface CompileOptions {
  /** Import specifier for Aster runtime helpers (default: '@fierst/aster') */
  runtimeImport?: string;
  /** Canonical module URL for automatic Lazy Revival `__asterSrc` & HMR stamping */
  moduleUrl?: string;
  /** Emit Vite+ HMR self-accept wiring (enabled during `vp dev`) */
  hmr?: boolean;
  /** Original source filename for V3 source maps */
  sourceFile?: string;
}

export interface SourceMapV3 {
  version: 3;
  file?: string;
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
}

export interface CompileResult {
  code: string;
  map: SourceMapV3;
  exportedGenerators: string[];
  exportedStateless: string[];
  exportedCallbacks: string[];
}

interface BindingMeta {
  kind: 'attr' | 'spread' | 'node';
  name?: string;
  path: number[];
}

interface HoistedTpl {
  id: string;
  html: string;
  bindings: BindingMeta[];
}

export interface JSXAttr {
  bindable?: boolean;
  name: string;
  value: string | null;
  isExpr: boolean;
  isSpread?: boolean;
}

export interface JSXEl {
  reference?: string;
  kind: 'el';
  tag: string;
  attrs: JSXAttr[];
  children: JSXChild[];
}

type JSXChild = JSXEl | { kind: 'text'; text: string } | { kind: 'expr'; code: string };

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeVLQ(value: number): string {
  let v = value < 0 ? (-value << 1) + 1 : value << 1;
  let out = '';
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += VLQ_CHARS[digit];
  } while (v > 0);
  return out;
}

export class SlotEmitter {
  private reserved: Set<string>;
  private names = new Map<string, string>();
  constructor(source: string) {
    // Reserve nested bindings and references as well as top-level declarations.
    const decoded = source.replace(
      /\\u(?:\{([0-9a-fA-F]+)\}|([0-9a-fA-F]{4}))/g,
      (raw, braced, short) => {
        const point = parseInt(braced ?? short, 16);
        return point <= 0x10ffff ? String.fromCodePoint(point) : raw;
      },
    );
    this.reserved = new Set(decoded.match(/[\w$]+/g));
  }
  local(base: string): string {
    let name = this.names.get(base);
    if (name) return name;
    name = base;
    while (this.reserved.has(name)) name += '$';
    this.names.set(base, name);
    this.reserved.add(name);
    return name;
  }
  hoisted: HoistedTpl[] = [];
  usedHelpers = new Set<string>();
  cleanJsxText(raw: string): string {
    if (!/[\r\n]/.test(raw)) return raw;
    const lines = raw.split(/\r\n|\n|\r/);
    const cleaned: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].replace(/\t/g, ' ');
      if (i > 0) line = line.trimStart();
      if (i < lines.length - 1) line = line.trimEnd();
      if (line.length > 0) cleaned.push(line);
    }
    return cleaned.join(' ');
  }

  isComponentTag(tag: string): boolean {
    return (
      tag.length > 0 &&
      ((tag[0] === tag[0].toUpperCase() && tag[0] !== tag[0].toLowerCase()) || tag.includes('.'))
    );
  }

  emitJSX(el: JSXEl): string {
    if (el.tag === '') {
      if (el.children.length === 0) return 'null';
      if (el.children.length === 1) return this.emitSingleChild(el.children[0]);
      return `[${el.children.map((c) => this.emitSingleChild(c)).join(', ')}]`;
    }

    if (this.isComponentTag(el.tag)) {
      this.usedHelpers.add('_comp');
      let keyExpr = '';
      const propParts: string[] = [];
      for (const a of el.attrs) {
        if (a.isSpread) {
          propParts.push(`...(${a.value})`);
          continue;
        }
        if (a.name === 'key') {
          keyExpr = a.isExpr ? a.value! : JSON.stringify(a.value);
          continue;
        }
        const k = /^[A-Za-z_$][\w$]*$/.test(a.name) ? a.name : JSON.stringify(a.name);
        if (a.value === null) propParts.push(`${k}: true`);
        else if (a.isExpr)
          propParts.push(`${k}: ${this.lowerAttrExpr(a.name, a.value, a.bindable)}`);
        else propParts.push(`${k}: ${JSON.stringify(a.value)}`);
      }
      if (el.children.length === 1) {
        propParts.push(`children: ${this.emitSingleChild(el.children[0])}`);
      } else if (el.children.length > 1) {
        propParts.push(`children: [${el.children.map((c) => this.emitSingleChild(c)).join(', ')}]`);
      }
      const propsObj = propParts.length ? `{ ${propParts.join(', ')} }` : '{}';
      return keyExpr
        ? `${this.local('_comp')}(${el.reference ?? el.tag}, ${propsObj}, ${keyExpr})`
        : `${this.local('_comp')}(${el.reference ?? el.tag}, ${propsObj})`;
    }

    this.usedHelpers.add('_tpl');
    this.usedHelpers.add('_slot');
    const bindings: BindingMeta[] = [];
    const values: string[] = [];
    let keyExpr = '';

    const buildHtml = (node: JSXEl, path: number[]): string => {
      let open = `<${node.tag}`;
      for (const a of node.attrs) {
        if (a.isSpread) {
          const idx = bindings.length;
          bindings.push({ kind: 'spread', path: [...path] });
          values.push(a.value!);
          open += ` data-aster-a${idx}=""`;
          continue;
        }
        if (a.name === 'key') {
          if (path.length === 1) keyExpr = a.isExpr ? a.value! : JSON.stringify(a.value);
          continue;
        }
        const isDirective =
          a.name.startsWith('var:') || a.name.startsWith('style:') || a.name.startsWith('class:');
        if (!a.isExpr && !isDirective) {
          const attrName = a.name === 'className' ? 'class' : a.name;
          open +=
            a.value === null ? ` ${attrName}` : ` ${attrName}="${a.value.replace(/"/g, '&quot;')}"`;
        } else {
          const idx = bindings.length;
          bindings.push({ kind: 'attr', name: a.name, path: [...path] });
          const expr = a.isExpr
            ? this.lowerAttrExpr(a.name, a.value!, a.bindable)
            : a.value === null
              ? 'true'
              : JSON.stringify(a.value);
          values.push(expr);
          open += ` data-aster-a${idx}=""`;
        }
      }
      if (VOID_TAGS.has(node.tag)) return open + '>';
      open += '>';

      let inner = '';
      let domChildIdx = 0;
      for (const ch of node.children) {
        if (ch.kind === 'text') {
          inner += ch.text;
          domChildIdx++;
        } else if (ch.kind === 'expr') {
          const idx = bindings.length;
          bindings.push({ kind: 'node', path: [...path, domChildIdx] });
          values.push(ch.code);
          inner += `<!--aster:${idx}-->`;
          domChildIdx++;
        } else if (ch.kind === 'el') {
          if (ch.tag === '' || this.isComponentTag(ch.tag)) {
            const idx = bindings.length;
            bindings.push({ kind: 'node', path: [...path, domChildIdx] });
            values.push(this.emitJSX(ch));
            inner += `<!--aster:${idx}-->`;
            domChildIdx++;
          } else {
            inner += buildHtml(ch, [...path, domChildIdx]);
            domChildIdx++;
          }
        }
      }
      return `${open}${inner}</${node.tag}>`;
    };

    const html = buildHtml(el, [0]);
    const id = this.local(`_t${this.hoisted.length + 1}`);
    this.hoisted.push({ id, html, bindings });
    const vals = `[${values.join(', ')}]`;
    return `${this.local('_slot')}(${id}, ${vals}${keyExpr ? ', ' + keyExpr : ''})`;
  }

  emitSingleChild(ch: JSXChild): string {
    if (ch.kind === 'text') return JSON.stringify(ch.text);
    if (ch.kind === 'expr') return ch.code;
    return this.emitJSX(ch);
  }

  lowerAttrExpr(name: string, expr: string, bindable?: boolean): string {
    if (name === 'bind:value' || name === 'bind:checked' || name === 'bind:open') {
      const trimmed = expr.trim();
      if (bindable) {
        const param = this.local('_v');
        return `[() => ${trimmed}, (${param}) => (${trimmed} = ${param})]`;
      }
    }
    return expr;
  }
}

export function emitModule(
  options: CompileOptions,
  lowerer: SlotEmitter,
  body: string,
  {
    generators,
    stateless,
    callbacks,
  }: Record<'generators' | 'stateless' | 'callbacks', { name: string; exportKey: string }[]>,
  isEntry = /\brender\s*\(/.test(body),
) {
  const runtimeImport = options.runtimeImport ?? '@fierst/aster';

  const footer: string[] = [];
  if (options.moduleUrl) {
    for (const g of generators) {
      footer.push(
        `${g.name}.__asterSrc = ${JSON.stringify(`${options.moduleUrl}#${g.exportKey}`)};`,
      );
    }
    for (const s of [...stateless, ...callbacks]) {
      footer.push(
        `${s.name}.__asterOwnerSrc = ${JSON.stringify(`${options.moduleUrl}#${s.exportKey}`)};`,
      );
    }
    if (options.hmr) {
      for (const s of stateless) {
        footer.push(
          `${s.name}.__asterHmrId = ${JSON.stringify(`${options.moduleUrl}#${s.exportKey}`)};`,
        );
      }
      // Inject self-accepting HMR handler for component modules (skip entry files that call top-level `render(`)
      const hasComponents = generators.length > 0 || stateless.length > 0;
      if (hasComponents && !isEntry) {
        lowerer.usedHelpers.add('__asterHmrAccept');
        footer.push(
          `if (import.meta.hot) { import.meta.hot.accept((_m) => { if (_m) ${lowerer.local('__asterHmrAccept')}(${JSON.stringify(options.moduleUrl)}, _m); }); }`,
        );
      }
    }
  }

  const header: string[] = [];
  if (lowerer.usedHelpers.size > 0) {
    const imports = [...lowerer.usedHelpers].map((name) =>
      name === lowerer.local(name) ? name : name + ' as ' + lowerer.local(name),
    );
    header.push(`import { ${imports.join(', ')} } from '${runtimeImport}';`);
  }
  for (const h of lowerer.hoisted) {
    header.push(
      `const ${h.id} = ${lowerer.local('_tpl')}(${JSON.stringify(h.html)}, ${JSON.stringify(h.bindings)});`,
    );
  }

  const headerStr = header.length > 0 ? header.join('\n') + '\n\n' : '';
  const footerStr = footer.length > 0 ? '\n\n' + footer.join('\n') : '';
  const code = headerStr + body + footerStr;

  return {
    code,
    exportedGenerators: generators.map((g) => g.name),
    exportedCallbacks: callbacks.map((c) => c.name),
    exportedStateless: stateless.map((s) => s.name),
  };
}
