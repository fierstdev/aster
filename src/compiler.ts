// Aster JSX-to-Slot Compiler
// Receives clean JavaScript + JSX after Vite+ / Oxc strips TypeScript (`oxc: { jsx: 'preserve' }`).
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

interface JSXAttr {
  name: string;
  value: string | null;
  isExpr: boolean;
  isSpread?: boolean;
}

interface JSXEl {
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

function isEmptyOrCommentOnly(code: string): boolean {
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
  return stripped.length === 0;
}

// =============================================================================
// Minimal Zero-Dependency VLQ Encoder for V3 Source Maps
// =============================================================================
const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeVLQ(value: number): string {
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

function buildLineSourceMap(
  originalSource: string,
  headerLineCount: number,
  bodyLineToSourceLine: number[],
  sourceFile: string,
): SourceMapV3 {
  const lines: string[] = [];
  for (let i = 0; i < headerLineCount; i++) lines.push('');

  let prevSrcLine = 0;
  for (let i = 0; i < bodyLineToSourceLine.length; i++) {
    const srcLine = bodyLineToSourceLine[i];
    // Segment: [genCol=0, srcIdx=0, srcLineDelta, srcCol=0]
    const seg = encodeVLQ(0) + encodeVLQ(0) + encodeVLQ(srcLine - prevSrcLine) + encodeVLQ(0);
    prevSrcLine = srcLine;
    lines.push(seg);
  }

  return {
    version: 3,
    sources: [sourceFile],
    sourcesContent: [originalSource],
    names: [],
    mappings: lines.join(';'),
  };
}

class JSXLowerer {
  src: string;
  pos = 0;
  hoisted: HoistedTpl[] = [];
  // Only JavaScript tokens outside literals, comments and JSX participate in export matching.
  declarationSource = '';
  usedHelpers = new Set<string>();
  /** Maps each output body line index -> 0-based line index in `this.src` */
  lineMap: number[] = [0];
  private srcLine = 0;

  constructor(src: string) {
    this.src = src;
  }

  private advance(count = 1) {
    for (let i = 0; i < count && this.pos < this.src.length; i++) {
      if (this.src[this.pos] === '\n') this.srcLine++;
      this.pos++;
    }
  }

  private trackOut(chunk: string, sourceLineAtStart: number): string {
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === '\n') this.lineMap.push(sourceLineAtStart);
    }
    return chunk;
  }

  run(): string {
    return this.scanJS(false);
  }

  scanJS(stopAtCloseBrace: boolean): string {
    let out = '';
    let braceDepth = 0;
    const n = this.src.length;

    while (this.pos < n) {
      const ch = this.src[this.pos];

      // Line comment
      if (ch === '/' && this.src[this.pos + 1] === '/') {
        if (!stopAtCloseBrace) this.declarationSource += ' ';
        const startLine = this.srcLine;
        const start = this.pos;
        const end = this.src.indexOf('\n', this.pos);
        const target = end === -1 ? n : end + 1;
        const slice = this.src.slice(start, target);
        this.advance(target - start);
        out += this.trackOut(slice, startLine);
        continue;
      }

      // Block comment
      if (ch === '/' && this.src[this.pos + 1] === '*') {
        if (!stopAtCloseBrace) this.declarationSource += ' ';
        const start = this.pos;
        const end = this.src.indexOf('*/', this.pos + 2);
        const target = end === -1 ? n : end + 2;
        for (let k = start; k < target; k++) {
          const c = this.src[k];
          out += c;
          if (c === '\n') {
            this.srcLine++;
            this.lineMap.push(this.srcLine);
          }
          this.pos++;
        }
        continue;
      }

      // String literals
      if (ch === '"' || ch === "'") {
        if (!stopAtCloseBrace) this.declarationSource += '0';
        const startLine = this.srcLine;
        out += this.trackOut(this.readString(ch), startLine);
        continue;
      }

      // Template literals
      if (ch === '`') {
        if (!stopAtCloseBrace) this.declarationSource += '0';
        out += this.readTemplateLiteral();
        continue;
      }

      // Regex literals
      if (ch === '/' && this.isRegexStart(out)) {
        if (!stopAtCloseBrace) this.declarationSource += '0';
        const startLine = this.srcLine;
        out += this.trackOut(this.readRegex(), startLine);
        continue;
      }

      if (stopAtCloseBrace) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') {
          if (braceDepth === 0) {
            this.advance(1);
            return out;
          }
          braceDepth--;
        }
      }

      // JSX opening tag `<Tag` or Fragment `<>`
      if (ch === '<' && this.isJSXStart(out)) {
        if (!stopAtCloseBrace) this.declarationSource += '0';
        const startLine = this.srcLine;
        const el = this.parseJSXElement();
        out += this.trackOut(this.emitJSX(el), startLine);
        continue;
      }

      out += ch;
      if (!stopAtCloseBrace) this.declarationSource += ch;
      if (ch === '\n') {
        this.srcLine++;
        this.lineMap.push(this.srcLine);
      }
      this.pos++;
    }
    return out;
  }

  isRegexStart(prevOut: string): boolean {
    const trimmed = prevOut.trimEnd();
    if (!trimmed) return true;
    const last = trimmed[trimmed.length - 1];
    if ('([{?:,=!&|;+-*%~^'.includes(last)) return true;
    if (/\b(?:return|yield|case|throw|in|of|typeof|void|delete|new)$/.test(trimmed)) return true;
    return false;
  }

  readRegex(): string {
    let s = '/';
    this.advance(1);
    let inClass = false;
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      this.advance(1);
      s += ch;
      if (ch === '\\' && this.pos < this.src.length) {
        s += this.src[this.pos];
        this.advance(1);
      } else if (ch === '[') {
        inClass = true;
      } else if (ch === ']') {
        inClass = false;
      } else if (ch === '/' && !inClass) {
        while (this.pos < this.src.length && /[a-z]/i.test(this.src[this.pos])) {
          s += this.src[this.pos];
          this.advance(1);
        }
        break;
      }
    }
    return s;
  }

  isJSXStart(prevOut: string): boolean {
    const next = this.src[this.pos + 1] || '';
    if (!(next === '>' || /[A-Za-z_]/.test(next))) return false;
    const trimmed = prevOut.trimEnd();
    if (!trimmed) return true;
    const lastChar = trimmed[trimmed.length - 1];
    if ('([{?:,=!&|;'.includes(lastChar)) return true;
    if (trimmed.endsWith('=>')) return true;
    if (/\b(?:return|yield|case|default)$/.test(trimmed)) return true;
    return false;
  }

  readString(q: string): string {
    let s = q;
    this.advance(1);
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      this.advance(1);
      s += ch;
      if (ch === '\\' && this.pos < this.src.length) {
        s += this.src[this.pos];
        this.advance(1);
      } else if (ch === q) {
        break;
      }
    }
    return s;
  }

  readTemplateLiteral(): string {
    let s = '`';
    this.advance(1);
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      this.advance(1);
      if (ch === '\\' && this.pos < this.src.length) {
        const next = this.src[this.pos];
        this.advance(1);
        s += ch + next;
        if (next === '\n') this.lineMap.push(this.srcLine);
      } else if (ch === '$' && this.src[this.pos] === '{') {
        this.advance(1);
        s += '${' + this.scanJS(true) + '}';
      } else if (ch === '`') {
        s += '`';
        break;
      } else {
        s += ch;
        if (ch === '\n') this.lineMap.push(this.srcLine);
      }
    }
    return s;
  }

  skipWS() {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.advance(1);
  }

  parseJSXElement(): JSXEl {
    this.advance(1); // consume '<'
    if (this.src[this.pos] === '>') {
      this.advance(1);
      const children = this.parseJSXChildren('');
      return { kind: 'el', tag: '', attrs: [], children };
    }

    let tag = '';
    while (this.pos < this.src.length && /[A-Za-z0-9_.:$-]/.test(this.src[this.pos])) {
      tag += this.src[this.pos];
      this.advance(1);
    }

    const attrs: JSXAttr[] = [];
    while (this.pos < this.src.length) {
      this.skipWS();
      if (this.src[this.pos] === '/' && this.src[this.pos + 1] === '>') {
        this.advance(2);
        return { kind: 'el', tag, attrs, children: [] };
      }
      if (this.src[this.pos] === '>') {
        this.advance(1);
        break;
      }
      // Spread attribute `{...expr}` or tag-level JSX comment `{/* ... */}`
      if (this.src[this.pos] === '{') {
        this.advance(1);
        const code = this.scanJS(true).trim();
        if (code.startsWith('...')) {
          attrs.push({ name: '...', value: code.slice(3).trim(), isExpr: true, isSpread: true });
        }
        // Else if comment-only (`{/* ... */}`), silently skip
        continue;
      }

      let name = '';
      while (this.pos < this.src.length && /[A-Za-z0-9_:.-]/.test(this.src[this.pos])) {
        name += this.src[this.pos];
        this.advance(1);
      }
      this.skipWS();
      if (this.src[this.pos] === '=') {
        this.advance(1);
        this.skipWS();
        if (this.src[this.pos] === '"' || this.src[this.pos] === "'") {
          const q = this.src[this.pos];
          const str = this.readString(q);
          attrs.push({ name, value: str.slice(1, -1), isExpr: false });
        } else if (this.src[this.pos] === '{') {
          this.advance(1);
          const code = this.scanJS(true).trim();
          attrs.push({ name, value: code, isExpr: true });
        }
      } else if (name) {
        attrs.push({ name, value: null, isExpr: false });
      } else {
        this.advance(1);
      }
    }

    if (VOID_TAGS.has(tag)) {
      return { kind: 'el', tag, attrs, children: [] };
    }
    const children = this.parseJSXChildren(tag);
    return { kind: 'el', tag, attrs, children };
  }

  private pushText(children: JSXChild[], text: string) {
    const prev = children[children.length - 1];
    if (prev && prev.kind === 'text') {
      prev.text += text;
    } else {
      children.push({ kind: 'text', text });
    }
  }

  private cleanJsxText(raw: string): string {
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

  parseJSXChildren(closingTag: string): JSXChild[] {
    const children: JSXChild[] = [];
    const closeMarker = `</${closingTag}>`;

    while (this.pos < this.src.length) {
      if (this.src.startsWith(closeMarker, this.pos)) {
        this.advance(closeMarker.length);
        break;
      }
      if (this.src[this.pos] === '<' && this.src[this.pos + 1] === '/') {
        const end = this.src.indexOf('>', this.pos + 2);
        if (end !== -1) {
          this.advance(end + 1 - this.pos);
          break;
        }
      }

      if (this.src[this.pos] === '{') {
        this.advance(1);
        const code = this.scanJS(true).trim();
        // Strip JSX comments `{/* ... */}` cleanly without creating empty slots!
        if (code && !isEmptyOrCommentOnly(code)) {
          children.push({ kind: 'expr', code });
        }
        continue;
      }

      if (
        this.src[this.pos] === '<' &&
        (this.src[this.pos + 1] === '>' || /[A-Za-z_]/.test(this.src[this.pos + 1] || ''))
      ) {
        children.push(this.parseJSXElement());
        continue;
      }

      let text = '';
      if (this.src[this.pos] === '<') throw new SyntaxError('Unexpected < in JSX children');
      while (
        this.pos < this.src.length &&
        this.src[this.pos] !== '<' &&
        this.src[this.pos] !== '{'
      ) {
        text += this.src[this.pos];
        this.advance(1);
      }
      const cleaned = this.cleanJsxText(text);
      if (cleaned !== '') {
        this.pushText(children, cleaned);
      }
    }
    return children;
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
        else if (a.isExpr) propParts.push(`${k}: ${this.lowerAttrExpr(a.name, a.value)}`);
        else propParts.push(`${k}: ${JSON.stringify(a.value)}`);
      }
      if (el.children.length === 1) {
        propParts.push(`children: ${this.emitSingleChild(el.children[0])}`);
      } else if (el.children.length > 1) {
        propParts.push(`children: [${el.children.map((c) => this.emitSingleChild(c)).join(', ')}]`);
      }
      const propsObj = propParts.length ? `{ ${propParts.join(', ')} }` : '{}';
      return keyExpr
        ? `_comp(${el.tag}, ${propsObj}, ${keyExpr})`
        : `_comp(${el.tag}, ${propsObj})`;
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
            ? this.lowerAttrExpr(a.name, a.value!)
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
    const id = `_t${this.hoisted.length + 1}`;
    this.hoisted.push({ id, html, bindings });
    const vals = `[${values.join(', ')}]`;
    return keyExpr ? `_slot(${id}, ${vals}, ${keyExpr})` : `_slot(${id}, ${vals})`;
  }

  emitSingleChild(ch: JSXChild): string {
    if (ch.kind === 'text') return JSON.stringify(ch.text);
    if (ch.kind === 'expr') return ch.code;
    return this.emitJSX(ch);
  }

  lowerAttrExpr(name: string, expr: string): string {
    if (name === 'bind:value' || name === 'bind:checked' || name === 'bind:open') {
      const trimmed = expr.trim();
      if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*$/.test(trimmed)) {
        return `[() => ${trimmed}, (_v) => (${trimmed} = _v)]`;
      }
    }
    return expr;
  }
}

function collectExportedComponents(jsBody: string) {
  const generators: { name: string; exportKey: string }[] = [];
  const stateless: { name: string; exportKey: string }[] = [];
  const seen = new Set<string>();

  // 1. Function declaration generators: `export [default] [async] function* Name`
  const genDeclRe = /\bexport\s+(?:default\s+)?(?:async\s+)?function\s*\*\s*([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = genDeclRe.exec(jsBody)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    generators.push({ name, exportKey: /\bexport\s+default\b/.test(m[0]) ? 'default' : name });
  }

  // 2. Variable expression generators: `export const Name = [async] function* (...)`
  const genExprRe =
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\s*\*/g;
  while ((m = genExprRe.exec(jsBody)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    generators.push({ name, exportKey: name });
  }

  // 3. Exported PascalCase stateless functions (declarations & arrows) — eligible for HMR, NOT Lazy Revival
  const fnRe = /\bexport\s+(?:default\s+)?function\s+([A-Z][\w$]*)\s*\(/g;
  while ((m = fnRe.exec(jsBody)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    stateless.push({ name, exportKey: /\bexport\s+default\b/.test(m[0]) ? 'default' : name });
  }

  const arrowRe =
    /\bexport\s+(?:const|let|var)\s+([A-Z][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
  while ((m = arrowRe.exec(jsBody)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    stateless.push({ name, exportKey: name });
  }

  return { generators, stateless };
}

/**
 * Full module compiler returning `{ code, map, exportedGenerators, exportedStateless }`.
 * Used by `src/vite.ts` for source-mapped dev/build compilation and automatic HMR.
 */
export function compileModule(source: string, options: CompileOptions = {}): CompileResult {
  const runtimeImport = options.runtimeImport ?? '@fierst/aster';
  const lowerer = new JSXLowerer(source);
  const body = lowerer.run();
  const { generators, stateless } = collectExportedComponents(lowerer.declarationSource);

  const footer: string[] = [];
  if (options.moduleUrl) {
    for (const g of generators) {
      footer.push(
        `${g.name}.__asterSrc = ${JSON.stringify(`${options.moduleUrl}#${g.exportKey}`)};`,
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
      const isEntry = /\brender\s*\(/.test(body);
      if (hasComponents && !isEntry) {
        lowerer.usedHelpers.add('__asterHmrAccept');
        footer.push(
          `if (import.meta.hot) { import.meta.hot.accept((_m) => { if (_m) __asterHmrAccept(${JSON.stringify(options.moduleUrl)}, _m); }); }`,
        );
      }
    }
  }

  const header: string[] = [];
  if (lowerer.usedHelpers.size > 0) {
    header.push(`import { ${[...lowerer.usedHelpers].join(', ')} } from '${runtimeImport}';`);
  }
  for (const h of lowerer.hoisted) {
    header.push(`const ${h.id} = _tpl(${JSON.stringify(h.html)}, ${JSON.stringify(h.bindings)});`);
  }

  const headerStr = header.length > 0 ? header.join('\n') + '\n\n' : '';
  const headerLineCount = headerStr ? headerStr.split('\n').length - 1 : 0;
  const footerStr = footer.length > 0 ? '\n\n' + footer.join('\n') : '';
  const code = headerStr + body + footerStr;

  const map = buildLineSourceMap(
    source,
    headerLineCount,
    lowerer.lineMap,
    options.sourceFile ?? options.moduleUrl ?? 'input.tsx',
  );

  return {
    code,
    map,
    exportedGenerators: generators.map((g) => g.name),
    exportedStateless: stateless.map((s) => s.name),
  };
}

/** Convenience wrapper returning compiled JS string. */
export function compileJSX(source: string, options: CompileOptions = {}): string {
  return compileModule(source, options).code;
}
