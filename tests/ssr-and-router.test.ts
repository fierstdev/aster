import { describe, expect, it } from 'vite-plus/test';
import { _tpl, _slot, _comp, ErrorBoundary, html, type Ctx } from '../src/index.ts';
import { renderToString, renderDocument, htmlResponse, resolveIslandSrc } from '../src/ssr.ts';
import { matchRoute, Router, useLocation, useParams, useSearchParams } from '../src/router.ts';
import { createContext, provide, useContext, Provider } from '../src/index.ts';
import { renderToStringAsync, renderToStream, streamResponse } from '../src/ssr.ts';
import { encodeIslandValue, decodeIslandValue } from '../src/island-values.ts';

it('round-trips ordinary data, reserved-looking keys, dates and nested query parameters', async () => {
  const data = {
    values: [undefined, new Date('2026-01-01'), new URLSearchParams('x=1&x=2')],
    record: JSON.parse('{"__proto__":"literal","type":"callback"}'),
    tag: ['component', 'ordinary text'],
  };
  const restored = await decodeIslandValue(
    JSON.parse(JSON.stringify(encodeIslandValue(data, (src) => src))),
  );
  expect(restored).toEqual(data);
  expect(Object.getPrototypeOf(restored.record)).toBe(Object.prototype);
});

it('reports unsupported island values in sync, async and streamed SSR', async () => {
  function* Panel() {
    yield 'panel';
  }
  Panel.__asterSrc = '/panel.js#Panel';
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const input of [cycle, () => 1, new Set()]) {
    const view = _comp(Panel, { payload: input });
    expect(() => renderDocument(view)).toThrow(/props\.payload/);
    await expect(renderToStringAsync(view, { revive: true })).rejects.toThrow(/props\.payload/);
    await expect(streamResponse(view).text()).rejects.toThrow(/props\.payload/);
  }
});

describe('SSR, Spread Attrs, & Production Manifest Lazy Revival', () => {
  it('uses one winning attribute in markup order across all server renderers', async () => {
    for (const [markup, winner] of [
      ['<input value="old" data-aster-a0="">', 'new'],
      ['<input data-aster-a0="" value="old">', 'old'],
    ]) {
      const view = _slot(_tpl(markup, [{ kind: 'spread', path: [0] }]), [{ value: 'new' }]);
      for (const result of [
        renderToString(view),
        await renderToStringAsync(view),
        await streamResponse(view).text(),
      ]) {
        expect(result).toContain(`<input value="${winner}">`);
      }
    }
  });
  it('matches literal dots and survives malformed percent escapes in either router', () => {
    const native = Object.getOwnPropertyDescriptor(globalThis, 'URLPattern');
    const routes = [
      { path: '/feed.xml', component: () => null },
      { path: '/users/:id', component: () => null },
    ];
    function verify() {
      expect(matchRoute(routes, '/feedXxml')).toBeNull();
      expect(matchRoute(routes, '/feed.xml')?.pathname).toBe('/feed.xml');
      expect(matchRoute(routes, '/users/%')?.params.id).toBe('%');
      expect(matchRoute(routes, '/users/a%20b')?.params.id).toBe('a b');
    }
    try {
      verify();
      Object.defineProperty(globalThis, 'URLPattern', { value: undefined, configurable: true });
      verify();
    } finally {
      if (native) Object.defineProperty(globalThis, 'URLPattern', native);
      else Reflect.deleteProperty(globalThis, 'URLPattern');
    }
  });
  it('advances generator once, escapes HTML, emits <aster-island>, and runs finally cleanup', () => {
    let cleaned = false;
    const _t1 = _tpl('<div class="card"><!--aster:0--></div>', [{ kind: 'node', path: [0, 0] }]);

    function* Card(props: { title: string }) {
      try {
        for (;;) yield _slot(_t1, [props.title]);
      } finally {
        cleaned = true;
      }
    }
    (Card as any).__asterSrc = '/src/Card.tsx#Card';

    const html = renderToString(_comp(Card, { title: '<script>xss</script>' }), { revive: true });
    expect(cleaned).toBe(true);
    expect(html).toContain('<aster-island data-aster-src="/src/Card.tsx#Card"');
    expect(html).toContain('&lt;script&gt;xss&lt;/script&gt;');
  });

  it('resolves hashed production chunk URLs from aster-manifest.json and Vite manifest.json', () => {
    expect(
      resolveIslandSrc('/src/Counter.tsx#Counter', {
        '/src/Counter.tsx': '/assets/Counter-Ab12Cd.js',
      }),
    ).toBe('/assets/Counter-Ab12Cd.js#Counter');

    expect(
      resolveIslandSrc('/src/Counter.tsx#Counter', {
        'src/Counter.tsx': { file: 'assets/Counter-Xy98Zz.js' },
      }),
    ).toBe('/assets/Counter-Xy98Zz.js#Counter');

    const _t1 = _tpl('<button><!--aster:0--></button>', [{ kind: 'node', path: [0, 0] }]);
    function* Counter(props: { start: number }) {
      for (;;) yield _slot(_t1, [props.start]);
    }
    (Counter as any).__asterSrc = '/src/Counter.tsx#Counter';

    const html = renderToString(_comp(Counter, { start: 3 }), {
      revive: true,
      manifest: { '/src/Counter.tsx': '/assets/Counter-Ab12Cd.js' },
    });
    expect(html).toContain('data-aster-src="/assets/Counter-Ab12Cd.js#Counter"');
  });

  it('renders intrinsic {...spread} props, style objects, and aria-* booleans cleanly in SSR', () => {
    const _t1 = _tpl('<button data-aster-a0="" data-aster-a1="">Go</button>', [
      { kind: 'spread', path: [0] },
      { kind: 'attr', name: 'style', path: [0] },
    ]);
    const html = renderToString(
      _slot(_t1, [
        { id: 'go-btn', 'aria-expanded': false, disabled: true, onClick: () => {} },
        { fontWeight: '600', '--accent': '#0071e3' },
      ]),
    );
    expect(html).toContain('id="go-btn"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('disabled');
    expect(html).toContain('style="font-weight:600;--accent:#0071e3"');
    expect(html).not.toContain('onClick');
  });

  it('suppresses nested <aster-island> wrappers inside an outer revived island', () => {
    const _tInner = _tpl('<span><!--aster:0--></span>', [{ kind: 'node', path: [0, 0] }]);
    const _tOuter = _tpl('<section><!--aster:0--></section>', [{ kind: 'node', path: [0, 0] }]);

    function* Inner() {
      for (;;) yield _slot(_tInner, ['ok']);
    }
    (Inner as any).__asterSrc = '/Inner.tsx#Inner';

    function* Outer() {
      for (;;) yield _slot(_tOuter, [_comp(Inner, {})]);
    }
    (Outer as any).__asterSrc = '/Outer.tsx#Outer';

    const html = renderToString(_comp(Outer, {}), { revive: true });
    const matches = html.match(/<aster-island /g) ?? [];
    expect(matches.length).toBe(1);
    expect(html).toContain('data-aster-src="/Outer.tsx#Outer"');
    expect(html).not.toContain('data-aster-src="/Inner.tsx#Inner"');
  });

  it('renders ErrorBoundary fallback during SSR when a child generator throws', () => {
    const _tErr = _tpl('<p class="err"><!--aster:0--></p>', [{ kind: 'node', path: [0, 0] }]);
    function* Broken() {
      throw new Error('Generator crashed');
      yield null;
    }

    const html = renderToString(
      _comp(ErrorBoundary, {
        fallback: (err: any) => _slot(_tErr, [err.message]),
        children: _comp(Broken, {}),
      }),
    );
    expect(html).toBe('<p class="err">Generator crashed</p>');
  });

  it('builds a full HTML5 document and Web-Standard Response', async () => {
    const _t1 = _tpl('<p>Hello</p>', []);
    const doc = renderDocument(_slot(_t1, []), {
      title: 'Aster',
      importmap: { aster: '/aster.js' },
      revive: true,
    });
    expect(doc).toMatch(/^<!doctype html>/);
    expect(doc).toContain('<title>Aster</title>');
    expect(doc).toContain('installRevival');

    const res = htmlResponse(_slot(_t1, []), { title: 'Edge' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<p>Hello</p>');
  });
});

describe('Router (URLPattern + SSR)', () => {
  it('keeps params, location and query scoped to each overlapping request', async () => {
    async function* Page() {
      await Promise.resolve();
      yield [useParams().id, '|', useLocation(), '|', useSearchParams().get('tab')];
    }
    const routes = [{ path: '/:id', component: Page }];
    const results = await Promise.all(
      ['one', 'two'].map((id) =>
        renderToStringAsync(_comp(Router, { routes, url: '/' + id + '?tab=' + id })),
      ),
    );
    expect(results).toEqual(['one|/one?tab=one|one', 'two|/two?tab=two|two']);
    expect(useParams()).toEqual({});
  });
  it('matches parameterized paths and parses searchParams', () => {
    const UserPage = () => null;
    const routes = [{ path: '/users/:id', component: UserPage }];
    const matched = matchRoute(routes, '/users/42?tab=activity');
    expect(matched).not.toBeNull();
    expect(matched?.params.id).toBe('42');
    expect(matched?.search.get('tab')).toBe('activity');
  });

  it('renders matched routes during SSR with automatic island wrapping', () => {
    const _t1 = _tpl('<h1>User <!--aster:0--></h1>', [{ kind: 'node', path: [0, 1] }]);
    function* UserPage(props: { params: { id: string } }) {
      for (;;) yield _slot(_t1, [props.params.id]);
    }
    (UserPage as any).__asterSrc = '/pages/User.tsx#UserPage';

    const html = renderToString(
      _comp(Router, { routes: [{ path: '/users/:id', component: UserPage }], url: '/users/99' }),
      { revive: true },
    );
    expect(html).toContain('<aster-island data-aster-src="/pages/User.tsx#UserPage"');
    expect(html).toContain('<h1>User <!--aster-s:0-->99<!--aster:0--></h1>');
  });
});

describe('SSR Attribute Merging, Range Anchors, Scoped Context, & Streaming', () => {
  it('renders nested markers and literal dollar sequences once in every SSR mode', async () => {
    const text = '$$ $&';
    const child = html`<span title="${'inner'}">${text}</span>`;
    const view = html`<main>${child}${'sibling'}</main>`;
    const expected =
      '<main><!--aster-s:0--><span title="inner"><!--aster-s:1-->$$ $&amp;<!--aster:1--></span><!--aster:0--><!--aster-s:1-->sibling<!--aster:1--></main>';
    function* Panel() {
      yield view;
    }
    Panel.__asterSrc = '/panel#Panel';
    const island = _comp(Panel, {});
    expect(renderToString(island, { revive: true })).toContain(expected);
    expect(await renderToStringAsync(island, { revive: true })).toContain(expected);
    expect(await streamResponse(island).text()).toContain(expected);
  });

  it('emits valid spread attributes and encodes document options for their HTML contexts', () => {
    const template = _tpl('<p data-aster-a0=""></p>', [{ kind: 'spread', path: [0] }]);
    const view = _slot(template, [{ 'bad key': 'skip', ONFOCUS: 'skip', 'data-title': 'a&b' }]);
    const doc = renderDocument(view, {
      lang: 'x"y',
      importmap: { sample: '/a<b' },
      revivalUrl: '/loader<a',
      runtimeUrl: '/runtime<a',
    });
    expect(doc).toContain('<p data-title="a&amp;b"></p>');
    expect(doc).toContain('lang="x&quot;y"');
    for (const value of ['/a', '/loader', '/runtime']) expect(doc).toContain(value + '\\u003c');
  });

  it('flushes the shell before an already-resolved sibling swap', async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    async function* Fast() {
      yield 'loading';
      yield 'ready';
    }
    async function* Slow() {
      await wait;
      yield 'slow';
    }
    const stream = renderToStream([_comp(Fast, {}), _comp(Slow, {})], { revive: false });
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    const doc = await new Response(stream).text();
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc.indexOf('<template')).toBeGreaterThan(doc.indexOf('<aster-b'));
    expect(doc).toContain('ready</template>');
  });

  it('runs registered cleanup for completed, failed and canceled SSR components', async () => {
    const cleaned: string[] = [];
    function Page(props: { id: string }, ctx: Ctx) {
      ctx.onCleanup(() => cleaned.push(props.id));
      if (props.id === 'failure') throw new Error('render failed');
      return 'ok';
    }
    renderToString(_comp(Page, { id: 'sync' }));
    await renderToStringAsync(_comp(Page, { id: 'async' }));
    expect(() => renderToString(_comp(Page, { id: 'failure' }))).toThrow('render failed');
    let done!: () => void;
    const disposed = new Promise<void>((resolve) => {
      done = resolve;
    });
    async function* Pending(_: {}, ctx: Ctx) {
      ctx.onCleanup(() => {
        cleaned.push('canceled');
        done();
      });
      yield 'loading';
      await new Promise((resolve) => ctx.signal.addEventListener('abort', resolve, { once: true }));
    }
    const reader = renderToStream(_comp(Pending, {})).getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel();
    await disposed;
    expect(cleaned).toEqual(['sync', 'async', 'failure', 'canceled']);
  });
  it('merges static class/style with class:*, style:*, and var:* in SSR with zero duplicates', () => {
    const _t1 = _tpl(
      '<button class="btn" style="padding:4px" data-aster-a0="" data-aster-a1="" data-aster-a2="" data-aster-a3="">Go</button>',
      [
        { kind: 'attr', name: 'class:primary', path: [0] },
        { kind: 'attr', name: 'class:hidden', path: [0] },
        { kind: 'attr', name: 'style:fontWeight', path: [0] },
        { kind: 'attr', name: 'var:accent', path: [0] },
      ],
    );
    const html = renderToString(_slot(_t1, [true, false, '700', '#0071e3']));
    expect(html).toBe(
      '<button class="btn primary" style="padding:4px;font-weight:700;--accent:#0071e3">Go</button>',
    );
  });

  it('emits <!--aster-s:i-->...<!--aster:i--> range anchors inside revived islands only', () => {
    const _t1 = _tpl('<button>Clicks: <!--aster:0--></button>', [{ kind: 'node', path: [0, 1] }]);
    function* Counter(props: { start: number }) {
      for (;;) yield _slot(_t1, [props.start]);
    }
    (Counter as any).__asterSrc = '/src/Counter.tsx#Counter';

    const staticHtml = renderToString(_comp(Counter, { start: 10 }), { revive: false });
    expect(staticHtml).toBe('<button>Clicks: 10</button>');

    const reviveHtml = renderToString(_comp(Counter, { start: 10 }), { revive: true });
    expect(reviveHtml).toContain('<button>Clicks: <!--aster-s:0-->10<!--aster:0--></button>');
  });

  it('isolates tree-scoped Context across concurrent overlapping renderToStringAsync() requests', async () => {
    const UserCtx = createContext('anon');
    const _tP = _tpl('<p><!--aster:0--></p>', [{ kind: 'node', path: [0, 0] }]);

    async function* AsyncProfile(props: { delay: number }) {
      const before = useContext(UserCtx);
      yield _slot(_tP, ['loading']);
      await new Promise((r) => setTimeout(r, props.delay));
      const after = useContext(UserCtx);
      yield _slot(_tP, [`${before}:${after}`]);
    }

    function RequestRoot(props: { user: string; delay: number }) {
      provide(UserCtx, props.user);
      return _comp(AsyncProfile, { delay: props.delay });
    }

    // Launch two concurrent SSR requests that interleave across awaits
    const [htmlA, htmlB] = await Promise.all([
      renderToStringAsync(_comp(RequestRoot, { user: 'alice', delay: 25 })),
      renderToStringAsync(_comp(RequestRoot, { user: 'bob', delay: 5 })),
    ]);

    expect(htmlA).toBe('<p>alice:alice</p>');
    expect(htmlB).toBe('<p>bob:bob</p>');
  });

  it('streams initial shell immediately and flushes out-of-order swap chunks via renderToStream()', async () => {
    const _tDiv = _tpl('<div><!--aster:0--><!--aster:1--></div>', [
      { kind: 'node', path: [0, 0] },
      { kind: 'node', path: [0, 1] },
    ]);
    const _tSpan = _tpl('<span><!--aster:0--></span>', [{ kind: 'node', path: [0, 0] }]);

    async function* SlowPanel() {
      yield _slot(_tSpan, ['loading-slow']);
      await new Promise((r) => setTimeout(r, 25));
      yield _slot(_tSpan, ['done-slow']);
    }

    async function* FastPanel() {
      yield _slot(_tSpan, ['loading-fast']);
      await new Promise((r) => setTimeout(r, 5));
      yield _slot(_tSpan, ['done-fast']);
    }

    const res = streamResponse(_slot(_tDiv, [_comp(SlowPanel, {}), _comp(FastPanel, {})]), {
      title: 'Streaming',
      revive: false,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const chunks: string[] = [];
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }

    // Chunk 0: initial shell with BOTH loading fallbacks
    expect(chunks[0]).toContain('<aster-b id="aster-b-1"><span>loading-slow</span></aster-b>');
    expect(chunks[0]).toContain('<aster-b id="aster-b-2"><span>loading-fast</span></aster-b>');

    const full = chunks.join('');
    // Fast panel flushes BEFORE slow panel (out-of-order streaming!)
    const fastIdx = full.indexOf('done-fast');
    const slowIdx = full.indexOf('done-slow');
    expect(fastIdx).toBeGreaterThan(-1);
    expect(slowIdx).toBeGreaterThan(fastIdx);
    expect(full.endsWith('</body></html>')).toBe(true);
  });

  it('supports <Provider> component in synchronous SSR', () => {
    const ThemeCtx = createContext('light');
    const _t1 = _tpl('<b><!--aster:0--></b>', [{ kind: 'node', path: [0, 0] }]);
    function ReadTheme() {
      return _slot(_t1, [useContext(ThemeCtx)]);
    }
    const html = renderToString(
      _comp(Provider, { context: ThemeCtx, value: 'dark', children: _comp(ReadTheme, {}) }),
    );
    expect(html).toBe('<b>dark</b>');
  });
});
