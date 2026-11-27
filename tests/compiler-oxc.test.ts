import { SourceMap } from 'node:module';
import { createServer } from 'vite-plus';
import { describe, expect, it } from 'vite-plus/test';
import { compileModule } from '../src/compiler-oxc.ts';
import { compileJSX } from '../playground/compiler.ts';
import { LESSONS } from '../playground/lessons.ts';
import aster from '../src/vite.ts';

describe('Oxc build compiler', () => {
  it('preserves parenthesized sequences as one slot in both compilers', () => {
    const source = 'function App(){return <div title={(1,2)}>{(3,4)}</div>}';
    expect(compileJSX(source)).toBe(compileModule(source).code);
    expect(compileJSX(source)).toContain('[(1,2), (3,4)]');
  });
  for (const [parser, compile] of Object.entries({
    build: (source: string) => compileModule(source, { sourceFile: 'Panel.tsx' }).code,
    editor: (source: string) => compileJSX(source, { sourceFile: 'Panel.tsx' }),
  })) {
    it(parser + ' locates invalid bindings and respects lexical shadowing', () => {
      for (const expr of ['draft', '42', 'true', '1 + 2']) {
        expect(() => compile('const draft = "Ada";\n<input bind:value={' + expr + '}/>')).toThrow(
          /Panel\.tsx:2:20: bind:value needs a writable/,
        );
      }
      const output = compile(
        'const draft = "Ada"; function Field({draft}){return <input bind:value={draft}/>;}',
      );
      expect(output).toContain('draft = _v');
      expect(
        compile('const draft = signal(""); const v = <input bind:value={draft}/>'),
      ).not.toContain('draft = _v');
      expect(
        compile('const draft = signal(""); const v = <input bind:value={[draft, draft.set]}/>'),
      ).toContain('[draft, draft.set]');
      expect(compile('const v = <input bind:value={makeAccessor()}/>')).toContain('makeAccessor()');
    });
  }
  it('reserves user names in nested scopes, template hoists and two-way setters', () => {
    const source = 'const _t1=1; export const Field = (_slot, _v) => <input bind:value={_v} />;';
    for (const code of [compileJSX(source), compileModule(source).code]) {
      expect(code).toContain('_slot as _slot$');
      expect(code).toContain('const _t1$ = _tpl(');
      expect(code).toContain('_slot$(_t1$, [');
      expect(code).toContain('(_v$) => (_v = _v$)');
    }
  });
  it('stamps local declarations with public aliases, including forward and default exports', () => {
    const result = compileModule(
      'export { Inner as Counter, fire as click }; function* Inner(){yield 1} const fire=()=>1; function Card(){return 2} export default Card;',
      { moduleUrl: '/a.jsx', hmr: true },
    );
    expect(result.code).toContain('Inner.__asterSrc = "/a.jsx#Counter"');
    expect(result.code).toContain('fire.__asterOwnerSrc = "/a.jsx#click"');
    expect(result.code).toContain('Card.__asterHmrId = "/a.jsx#default"');
  });
  it('shares slot output with the browser editor for every lesson', () => {
    for (const { starter, solution } of LESSONS) {
      for (const source of [starter, solution])
        expect(compileModule(source).code).toBe(compileJSX(source));
    }
  });

  it('stamps nested default parameters and skips type-only overloads', () => {
    const source =
      'export const Save = (label = String(42)) => <b>{label}</b>;\n' +
      'export function title(label: string): string;\nexport function title(label: string) { return label; }';
    const result = compileModule(source, { moduleUrl: '/Save.tsx', hmr: true });
    expect(result.exportedStateless).toEqual(['Save']);
    expect(result.exportedCallbacks).toEqual(['title']);
    expect(result.code).toContain('Save.__asterOwnerSrc = "/Save.tsx#Save"');
    expect(result.code).toContain('Save.__asterHmrId');
  });

  it('only recovers comment-only opening-tag braces and reports unrelated syntax errors', () => {
    const source = [
      'const text = "<p {/* keep */}>";',
      'const view = <p title="🪴 {/* keep */}" { /* } */ /* two */ }',
      ' { // another 🪴',
      ' }>{text}{/* child */}</p>;',
    ].join('\r\n');
    const result = compileModule(source);
    expect(result.code).toContain('const text = "<p {/* keep */}>"');
    expect(result.code).toContain('🪴 {/* keep */}');
    expect(result.code).not.toMatch(/another|two|child \*\//);
    expect(() =>
      compileModule('const bad = <p {/* valid */} {nope} />', { sourceFile: 'broken.tsx' }),
    ).toThrow(/broken.tsx/);
  });

  it('maps copied code, reordered keys, nested expressions and both copies of a binding', () => {
    const source = [
      'const state = { draft: "", id: 1 };',
      'const view = <main key={state.id}><input bind:value={state.draft}/>{',
      '  state.id && <b title={state.draft}>{',
      '    "🪴" + state.draft',
      '  }</b>',
      '}</main>;',
    ].join('\r\n');
    const { code, map } = compileModule(source);
    const decoded = new SourceMap({ ...map, file: 'output.js', sourceRoot: '' });
    function mapped(token: string, generatedOccurrence: number, originalOccurrence: number) {
      function position(text: string, occurrence: number) {
        const offsets = [...text.matchAll(new RegExp(token.replaceAll('.', '\\.'), 'g'))];
        expect(offsets.length).toBeGreaterThan(occurrence);
        const prefix = text.slice(0, offsets[occurrence].index + token.length - 1).split('\n');
        return { line: prefix.length - 1, column: prefix.at(-1)!.length };
      }
      const at = position(code, generatedOccurrence),
        original = position(source, originalOccurrence);
      expect(decoded.findEntry(at.line, at.column)).toMatchObject({
        originalLine: original.line,
        originalColumn: original.column,
      });
    }
    mapped('const state', 0, 0);
    mapped('state.draft', 0, 0);
    mapped('state.draft', 1, 0);
    mapped('state.draft', 2, 1);
    mapped('state.draft', 3, 2);
    mapped('state.id', 0, 1);
    mapped('state.id', 1, 0);
  });

  it('composes the default Vite transform back to the original commented TSX', async () => {
    const id = '/src/comment-map-fixture.tsx';
    const source =
      'export function Badge(props: { count: number }) {\n  return <span {/* 🪴 */}>{props.count}</span>;\n}';
    const server = await createServer({
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true },
      plugins: [
        {
          name: 'test-source',
          resolveId(url) {
            if (url === id) return id;
          },
          load(url) {
            if (url === id) return source;
          },
        },
        aster(),
      ],
    });
    try {
      const result = await server.transformRequest(id, { ssr: true });
      expect(result?.code).toContain('_slot');
      const lines = result!.code.split('\n');
      const line = lines.findIndex((s) => s.includes('props.count'));
      const entry = new SourceMap(
        result!.map as ConstructorParameters<typeof SourceMap>[0],
      ).findEntry(line, lines[line].indexOf('props.count'));
      expect(entry).toMatchObject({
        originalLine: 1,
        originalColumn: source.split('\n')[1].indexOf('props.count'),
      });
    } finally {
      await server.close();
    }
  });
});
