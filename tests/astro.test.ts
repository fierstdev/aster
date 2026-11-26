import { describe, expect, it } from 'vite-plus/test';
import { _tpl, _slot } from '../src/index.ts';
import asterAstro from '../src/astro/index.ts';
import serverRenderer, { check, renderToStaticMarkup } from '../src/astro/server.ts';

describe('@fierst/aster/astro Integration Setup', () => {
  it('registers server & client renderers and Vite plugin with include/exclude filters', () => {
    const integration = asterAstro({
      include: ['**/aster/**/*.tsx'],
      exclude: ['**/react/**'],
    });
    expect(integration.name).toBe('aster');

    const renderers: any[] = [];
    const configs: any[] = [];
    integration.hooks['astro:config:setup']({
      addRenderer: (r) => renderers.push(r),
      updateConfig: (c) => configs.push(c),
    });

    expect(renderers).toEqual([
      {
        name: 'aster',
        clientEntrypoint: '@fierst/aster/astro/client',
        serverEntrypoint: '@fierst/aster/astro/server',
      },
    ]);

    const vitePlugin = configs[0]?.vite?.plugins?.[0];
    expect(vitePlugin?.name).toBe('aster');
    expect(configs[0]?.vite?.optimizeDeps?.exclude).toContain('@fierst/aster/astro/client');

    // Verify include/exclude filtering in multi-framework Astro projects
    vitePlugin.configResolved({ root: '/app', command: 'serve' });
    const skippedReact = vitePlugin.transform.call(
      {},
      'export function Btn() { return <button>React</button>; }',
      '/app/src/react/Btn.tsx',
    );
    expect(skippedReact).toBeNull();

    const compiledAster = vitePlugin.transform.call(
      {},
      'export function* Counter() { let n = 0; for (;;) yield <button>{n}</button>; }',
      '/app/src/aster/Counter.tsx',
    );
    expect(compiledAster?.code).toContain('_tpl(');
    expect(compiledAster?.code).toContain('Counter.__asterSrc');
  });
});

describe('@fierst/aster/astro/server Renderer', () => {
  it('accurately detects Aster components and rejects React / non-Aster components', async () => {
    function* GenComp() {
      for (;;) yield _slot(_tpl('<p>hi</p>', []), []);
    }
    async function* AsyncGenComp() {
      yield _slot(_tpl('<p>async</p>', []), []);
    }
    function StatelessAster() {
      return _slot(_tpl('<span>aster</span>', []), []);
    }
    function StampedComp() {
      return null;
    }
    (StampedComp as any).__asterHmrId = '/src/Stamped.tsx#StampedComp';

    // Simulated React components (function returning React element + class component)
    function ReactFn() {
      return { $$typeof: Symbol.for('react.transitional.element'), type: 'div', props: {} };
    }
    class ReactClass {}
    (ReactClass.prototype as any).isReactComponent = {};

    expect(await check(GenComp)).toBe(true);
    expect(await check(AsyncGenComp)).toBe(true);
    expect(await check(StatelessAster)).toBe(true);
    expect(await check(StampedComp)).toBe(true);

    expect(await check(ReactFn)).toBe(false);
    expect(await check(ReactClass)).toBe(false);
    expect(await check('not-a-component')).toBe(false);
    expect(await check(null)).toBe(false);
  });

  it('renders static Astro SSR without range anchors and hydrated Astro SSR with range anchors (no duplicate <aster-island>)', async () => {
    const _tBtn = _tpl('<button class="btn" data-aster-a0="">Clicks: <!--aster:1--></button>', [
      { kind: 'attr', name: 'class:hot', path: [0] },
      { kind: 'node', path: [0, 1] },
    ]);

    function* Counter(props: { start: number }) {
      for (;;) yield _slot(_tBtn, [props.start > 5, props.start]);
    }
    (Counter as any).__asterSrc = '/src/Counter.tsx#Counter';

    // Static Astro render (no client:* directive) -> comment-free HTML, no attrs
    const staticRes = await renderToStaticMarkup(Counter, { start: 10 }, {}, {});
    expect(staticRes.html).toBe('<button class="btn hot">Clicks: 10</button>');
    expect(staticRes.attrs).toBeUndefined();

    // Hydrated Astro render (client:visible) -> range anchors WITHOUT outer <aster-island>
    const hydratedRes = await renderToStaticMarkup(
      Counter,
      { start: 10 },
      {},
      { hydrate: 'visible', astroStaticSlot: true },
    );
    expect(hydratedRes.html).toBe(
      '<button class="btn hot">Clicks: <!--aster-s:1-->10<!--aster:1--></button>',
    );
    expect(hydratedRes.html).not.toContain('<aster-island');
    expect(hydratedRes.attrs).toEqual({ 'data-aster-astro': '1' });
  });

  it('supports default & named Astro slots without double-escaping and awaits async function* components', async () => {
    const _tCard = _tpl(
      '<article><header><!--aster:0--></header><div><!--aster:1--></div></article>',
      [
        { kind: 'node', path: [0, 0, 0] },
        { kind: 'node', path: [0, 1, 0] },
      ],
    );

    async function* AsyncCard(props: { header?: any; children?: any }) {
      yield _slot(_tpl('<p>loading</p>', []), []);
      await new Promise((r) => setTimeout(r, 5));
      yield _slot(_tCard, [props.header, props.children]);
    }

    const res = await serverRenderer.renderToStaticMarkup(
      AsyncCard,
      {},
      { header: '<h2>Title</h2>', default: '<p>Body &amp; content</p>' },
      { astroStaticSlot: true },
    );

    expect(res.html).toBe(
      '<article><header><astro-slot name="header"><h2>Title</h2></astro-slot></header>' +
        '<div><astro-slot><p>Body &amp; content</p></astro-slot></div></article>',
    );
  });
});
