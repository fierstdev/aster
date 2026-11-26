import { describe, expect, it } from 'vite-plus/test';
import { compileJSX, compileModule } from '../src/compiler.ts';
import { jsx } from '../src/jsx-runtime.ts';
import { renderToString } from '../src/ssr.ts';

describe('Aster JSX-to-Slot Compiler', () => {
  it('hoists static HTML into _tpl() and lowers dynamic slots into _slot()', () => {
    const out = compileJSX(`
      export function* Counter(props, ctx) {
        let count = 0;
        for (props of ctx) {
          yield <button class="primary" onClick={() => count++}>Count: {count}</button>;
        }
      }
    `, { moduleUrl: '/components/Counter.tsx' });

    expect(out).toContain("import { _tpl, _slot } from '@fierst/aster';");
    expect(out).toContain('const _t1 = _tpl("<button class=\\"primary\\" data-aster-a0=\\"\\">Count: <!--aster:1--></button>"');
    expect(out).toContain('_slot(_t1, [() => count++, count])');
    expect(out).toContain('Counter.__asterSrc = "/components/Counter.tsx#Counter";');
  });

  it('automatically lowers bind:value, bind:checked, and bind:open lvalues into [get, set] tuples', () => {
    const out = compileJSX(`
      function Form() {
        let draft = '';
        let done = false;
        return (
          <form>
            <input bind:value={draft} />
            <input type="checkbox" bind:checked={done} />
          </form>
        );
      }
    `);

    expect(out).toContain('[() => draft, (_v) => (draft = _v)]');
    expect(out).toContain('[() => done, (_v) => (done = _v)]');
  });

  it('strips JSX comments {/* ... */} cleanly and merges adjacent text nodes without path drift', () => {
    const out = compileJSX(`
      export function Note(props) {
        return (
          <p {/* tag comment */}>
            Hello {/* middle comment */} world {props.name}
          </p>
        );
      }
    `);

    expect(out).not.toContain('middle comment');
    expect(out).not.toContain('tag comment');
    // Adjacent text runs around the comment merged into a single Text node at index 0,
    // so the dynamic expression comment sits cleanly at path [0, 1]!
    expect(out).toContain('{"kind":"node","path":[0,1]}');
  });

  it('lowers {...spread} props on both Components and intrinsic HTML elements', () => {
    const out = compileJSX(`
      export function Wrapper(props) {
        return (
          <div>
            <Child {...props} extra="ok" />
            <button {...props.btnProps} class="btn">Go</button>
          </div>
        );
      }
    `);

    expect(out).toContain('_comp(Child, { ...(props), extra: "ok" })');
    expect(out).toContain('{"kind":"spread","path":[0,1]}');
    expect(out).toContain('props.btnProps');
  });

  it('emits valid V3 source maps and dev-mode HMR self-accept wiring', () => {
    const res = compileModule(`
      export function* Counter(props, ctx) {
        let n = 0;
        for (props of ctx) yield <button onClick={() => n++}>{n}</button>;
      }
      export function Badge(props) {
        return <span>{props.text}</span>;
      }
    `, { moduleUrl: '/src/Counter.tsx', hmr: true });

    expect(res.map.version).toBe(3);
    expect(res.map.sources).toEqual(['/src/Counter.tsx']);
    expect(res.map.mappings.length).toBeGreaterThan(0);
    expect(res.exportedGenerators).toEqual(['Counter']);
    expect(res.exportedStateless).toEqual(['Badge']);
    expect(res.code).toContain('Counter.__asterSrc = "/src/Counter.tsx#Counter";');
    expect(res.code).toContain('Badge.__asterHmrId = "/src/Counter.tsx#Badge";');
    expect(res.code).toContain('__asterHmrAccept("/src/Counter.tsx"');
    expect(res.code).not.toContain('Badge.__asterSrc');
  });

  it('stamps exported default and async generator components automatically', () => {
    const out = compileJSX(`
      export default async function* UserCard(props, ctx) {
        yield <div>Loading</div>;
      }
    `, { moduleUrl: '/UserCard.tsx' });

    expect(out).toContain('UserCard.__asterSrc = "/UserCard.tsx#default";');
  });

  it('ignores < characters inside regex literals and strings', () => {
    const out = compileJSX(`
      export function Check(str) {
        const hasTag = /<div[^>]*>/i.test(str);
        return <p>{hasTag ? 'yes' : 'no'}</p>;
      }
    `);

    expect(out).toContain('/<div[^>]*>/i.test(str)');
    expect(out).toContain("_slot(_t1, [hasTag ? 'yes' : 'no'])");
  });
});


describe('Compiler Expression Exports & JSX Runtime Fallback', () => {
  it('stamps variable expression generators (`export const Widget = function*()`) and arrow stateless components', () => {
    const res = compileModule(`
      export const Widget = function* (props, ctx) {
        let x = 0;
        for (props of ctx) yield <span>{x}</span>;
      };
      export const AsyncWidget = async function* () {
        yield <div>ready</div>;
      };
      export const Pill = ({ text }) => <span class="pill">{text}</span>;
    `, { moduleUrl: '/src/Widgets.tsx', hmr: true });

    expect(res.exportedGenerators).toEqual(['Widget', 'AsyncWidget']);
    expect(res.exportedStateless).toEqual(['Pill']);
    expect(res.code).toContain('Widget.__asterSrc = "/src/Widgets.tsx#Widget";');
    expect(res.code).toContain('AsyncWidget.__asterSrc = "/src/Widgets.tsx#AsyncWidget";');
    expect(res.code).toContain('Pill.__asterHmrId = "/src/Widgets.tsx#Pill";');
    expect(res.code).not.toContain('Pill.__asterSrc');
  });

  it('supports runtime jsx() fallback for intrinsic elements when executed without Vite plugin', () => {
    const vnode = jsx('button', { class: 'btn', 'class:primary': true, children: 'Fallback' });
    const html = renderToString(vnode);
    expect(html).toBe('<button class="btn primary">Fallback</button>');
  });
});
