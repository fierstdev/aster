import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  render,
  claim,
  signal,
  createContext,
  provide,
  useContext,
  Provider,
  ErrorBoundary,
  defineElement,
  css,
  __asterHmrAccept,
  type Ctx,
} from '@fierst/aster';
import { renderToString, renderToStream } from '@fierst/aster/ssr';
import { installRevival } from '@fierst/aster/revive';
import { LESSONS } from '../../playground/lessons.ts';
import { mountSandbox } from '../../playground/sandbox.ts';
import astroServer from '../../src/astro/server.ts';
import hydrateAster from '../../src/astro/client.ts';

let root: HTMLDivElement;
let dispose: (() => void) | null = null;

const flush = () => new Promise<void>((r) => queueMicrotask(r));
const tick = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms));

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  dispose?.();
  dispose = null;
  root.remove();
});

describe('Aster Real-Browser DOM Runtime', () => {
  it('claims keyed list entries inside a slot and preserves their buttons across reorder', async () => {
    function* Rows() {
      let items = ['first', 'second'];
      for (;;)
        yield (
          <main>
            {items.map((key) => (
              <button key={key} onClick={() => (items = [...items].reverse())}>
                {key}
              </button>
            ))}
          </main>
        );
    }
    root.innerHTML = renderToString(<Rows />, { revive: true, _inIsland: true });
    const original = root.querySelector('button')!;
    const handle = claim(Rows, {}, root);
    dispose = () => handle.dispose();
    original.click();
    await flush();
    expect(root.querySelectorAll('button')[1]).toBe(original);
  });
  it('releases handlers on retired slots while the parent remains mounted', async () => {
    const shown = signal(true);
    let clicks = 0;
    function* Parent() {
      for (;;)
        yield <main>{shown() && <button {...{ onClick: () => clicks++ }}>Press</button>}</main>;
    }
    dispose = render(<Parent />, root);
    const retired = root.querySelector('button')!;
    retired.click();
    shown.set(false);
    await flush();
    retired.click();
    expect(clicks).toBe(1);
    shown.set(true);
    await flush();
    root.querySelector('button')!.click();
    expect(clicks).toBe(2);
  });
  it('retries failed revival and replays pending clicks in order after one claim', async () => {
    const moduleUrl = (source: string) => 'data:text/javascript,' + encodeURIComponent(source);
    const runtime = moduleUrl('export function claim(component, props, el) { component(el); }');
    const component = moduleUrl(`
      export default function(el) {
        el.dataset.claims = String(Number(el.dataset.claims || 0) + 1);
        el.addEventListener('click', e => { el.dataset.order = (el.dataset.order || '') + e.detail; });
      }
    `);
    const uninstall = installRevival(runtime);
    try {
      root.dataset.asterSrc = component + '#missing';
      const failure = new Promise((resolve) =>
        root.addEventListener('aster:revival-error', resolve, { once: true }),
      );
      root.click();
      await failure;
      root.dataset.asterSrc = component;
      for (const detail of [1, 2])
        root.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
      await vi.waitFor(() => expect(root.dataset.order).toBe('12'));
      expect(root.dataset.claims).toBe('1');
    } finally {
      uninstall();
    }
  });
  it('runs function* local `let` state, derived const, and try/finally cleanup on unmount', async () => {
    let cleaned = false;

    function* Counter(props: { start?: number }, ctx: Ctx) {
      let count = props.start ?? 0;
      try {
        for (props of ctx) {
          const doubled = count * 2;
          yield (
            <div>
              <button id="inc" onClick={() => count++}>
                Count: {count} (2x={doubled})
              </button>
            </div>
          );
        }
      } finally {
        cleaned = true;
      }
    }

    dispose = render(<Counter start={3} />, root);
    const btn = root.querySelector('#inc') as HTMLButtonElement;
    expect(btn.textContent).toBe('Count: 3 (2x=6)');

    btn.click();
    await flush();
    expect(btn.textContent).toBe('Count: 4 (2x=8)');
    expect(cleaned).toBe(false);

    dispose();
    dispose = null;
    expect(cleaned).toBe(true);
  });

  it('executes native yield* confirmation flows returning typed booleans + teardown propagation', async () => {
    let subCleaned = false;
    const deleted: string[] = [];

    function* confirmDelete(title: string): Generator<any, boolean, any> {
      let choice: boolean | null = null;
      try {
        while (choice === null) {
          yield (
            <div class="confirm">
              <span>Delete {title}?</span>
              <button id="cancel" onClick={() => (choice = false)}>
                Cancel
              </button>
              <button id="confirm" onClick={() => (choice = true)}>
                Confirm
              </button>
            </div>
          );
        }
        return choice;
      } finally {
        subCleaned = true;
      }
    }

    function* Row() {
      let asking = false;
      for (;;) {
        if (asking) {
          const ok = yield* confirmDelete('Task A');
          asking = false;
          if (ok) {
            deleted.push('Task A');
            yield <p id="done">Deleted!</p>;
            return;
          }
        }
        yield (
          <button id="ask" onClick={() => (asking = true)}>
            Delete
          </button>
        );
      }
    }

    dispose = render(<Row />, root);
    (root.querySelector('#ask') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('.confirm')?.textContent).toContain('Delete Task A?');

    // Cancel returns false and restores row
    (root.querySelector('#cancel') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('#ask')).not.toBeNull();
    expect(deleted).toEqual([]);

    // Trigger again and Confirm
    (root.querySelector('#ask') as HTMLButtonElement).click();
    await flush();
    (root.querySelector('#confirm') as HTMLButtonElement).click();
    await flush();
    expect(deleted).toEqual(['Task A']);
    expect(root.querySelector('#done')?.textContent).toBe('Deleted!');
    expect(subCleaned).toBe(true);
  });

  it('handles bind:value, bind:checked, spread props, style objects, class:*, var:*, and aria-* booleans', async () => {
    function* Form() {
      let text = 'hello';
      let checked = false;
      for (;;) {
        const extra = { 'data-len': text.length, 'aria-expanded': checked };
        yield (
          <div>
            <input id="txt" bind:value={text} />
            <input id="chk" type="checkbox" bind:checked={checked} />
            <span
              id="out"
              {...extra}
              class="base"
              class:active={checked}
              style={{ fontWeight: checked ? '700' : '400' }}
              var:accent="#0071e3"
            >
              {text}
            </span>
          </div>
        );
      }
    }

    dispose = render(<Form />, root);
    const input = root.querySelector('#txt') as HTMLInputElement;
    const chk = root.querySelector('#chk') as HTMLInputElement;
    const out = root.querySelector('#out') as HTMLSpanElement;

    expect(input.value).toBe('hello');
    expect(out.getAttribute('aria-expanded')).toBe('false');
    expect(out.style.getPropertyValue('--accent')).toBe('#0071e3');

    input.value = '@fierst/aster';
    input.dispatchEvent(new Event('input'));
    chk.checked = true;
    chk.dispatchEvent(new Event('change'));
    await flush();

    expect(out.textContent).toBe('@fierst/aster');
    expect(out.getAttribute('data-len')).toBe('13');
    expect(out.getAttribute('aria-expanded')).toBe('true');
    expect(out.classList.contains('active')).toBe(true);
    expect(out.style.fontWeight).toBe('700');
  });

  it('preserves exact DOM node identity across keyed .map() reorders', async () => {
    function* List() {
      let items = [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
        { id: 'c', label: 'Gamma' },
      ];
      for (;;) {
        yield (
          <div>
            <button id="rev" onClick={() => (items = [...items].reverse())}>
              Reverse
            </button>
            <ul>
              {items.map((it) => (
                <li key={it.id} data-id={it.id}>
                  {it.label}
                </li>
              ))}
            </ul>
          </div>
        );
      }
    }

    dispose = render(<List />, root);
    const beforeA = root.querySelector('li[data-id="a"]');
    const beforeC = root.querySelector('li[data-id="c"]');

    (root.querySelector('#rev') as HTMLButtonElement).click();
    await flush();

    const lis = [...root.querySelectorAll('li')];
    expect(lis.map((el) => el.textContent)).toEqual(['Gamma', 'Beta', 'Alpha']);
    // Same exact DOM element references moved, not recreated!
    expect(lis[0]).toBe(beforeC);
    expect(lis[2]).toBe(beforeA);
  });

  it('parses bare <tr> table rows and SVG <circle> elements with proper namespaces', () => {
    const rows = [
      { id: 1, name: 'Row 1' },
      { id: 2, name: 'Row 2' },
    ];
    const dots = [10, 30];

    function TableAndSvg() {
      return (
        <div>
          <table>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <svg viewBox="0 0 100 100">
            {dots.map((cx) => (
              <circle key={cx} cx={cx} cy={20} r={5} />
            ))}
          </svg>
        </div>
      );
    }

    dispose = render(<TableAndSvg />, root);
    const trs = root.querySelectorAll('tbody > tr');
    expect(trs.length).toBe(2);
    expect(trs[0].querySelector('td')?.textContent).toBe('Row 1');
    expect(trs[1].querySelector('td')?.textContent).toBe('Row 2');

    const circles = root.querySelectorAll('svg > circle');
    expect(circles.length).toBe(2);
    expect(circles[0].namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(circles[0].getAttribute('cx')).toBe('10');
    expect(circles[1].getAttribute('cx')).toBe('30');
  });

  it('restarts async function* on prop change, aborts stale runs, and skips restart on identical props', async () => {
    const abortedIds: string[] = [];
    let runs = 0;

    async function* UserLoader(props: { id: string }, ctx: Ctx) {
      runs++;
      const myId = props.id;
      ctx.signal.addEventListener('abort', () => abortedIds.push(myId));
      yield <p id="status">Loading {myId}…</p>;
      await tick(25);
      if (ctx.signal.aborted) return;
      yield <p id="status">Loaded {myId}</p>;
    }

    function* Host() {
      let userId = 'u1';
      let unrelated = 0;
      for (;;) {
        yield (
          <div>
            <button id="bump" onClick={() => unrelated++}>
              Unrelated: {unrelated}
            </button>
            <button id="switch" onClick={() => (userId = 'u2')}>
              Switch
            </button>
            <UserLoader id={userId} />
          </div>
        );
      }
    }

    dispose = render(<Host />, root);
    await flush();
    expect(root.querySelector('#status')?.textContent).toBe('Loading u1…');
    expect(runs).toBe(1);

    // Unrelated parent update must NOT restart UserLoader
    (root.querySelector('#bump') as HTMLButtonElement).click();
    await flush();
    expect(runs).toBe(1);

    // Switching prop id MUST abort u1 and start u2
    (root.querySelector('#switch') as HTMLButtonElement).click();
    await flush();
    await flush();
    expect(abortedIds).toEqual(['u1']);
    expect(runs).toBe(2);
    expect(root.querySelector('#status')?.textContent).toBe('Loading u2…');

    await tick(40);
    expect(root.querySelector('#status')?.textContent).toBe('Loaded u2');
  });

  it('propagates tree-scoped Context cleanly and isolates sibling Providers', () => {
    const ThemeCtx = createContext('default');

    function Leaf({ id }: { id: string }) {
      return <span id={id}>{useContext(ThemeCtx)}</span>;
    }

    function CustomProvider({ val, id }: { val: string; id: string }) {
      provide(ThemeCtx, val);
      return <Leaf id={id} />;
    }

    function Tree() {
      return (
        <div>
          <Leaf id="outside" />
          <Provider context={ThemeCtx} value="dark">
            <Leaf id="inside-dark" />
          </Provider>
          <CustomProvider val="solarized" id="inside-custom" />
        </div>
      );
    }

    dispose = render(<Tree />, root);
    expect(root.querySelector('#outside')?.textContent).toBe('default');
    expect(root.querySelector('#inside-dark')?.textContent).toBe('dark');
    expect(root.querySelector('#inside-custom')?.textContent).toBe('solarized');
  });

  it('recovers a closed generator cleanly via <ErrorBoundary> reset()', async () => {
    let shouldThrow = true;

    function* Flaky() {
      let n = 0;
      for (;;) {
        if (shouldThrow) throw new Error('Boom!');
        yield (
          <button id="ok-btn" onClick={() => n++}>
            Alive: {n}
          </button>
        );
      }
    }

    dispose = render(
      <ErrorBoundary
        fallback={(err, reset) => (
          <div>
            <p id="err-msg">{String((err as Error).message)}</p>
            <button id="retry" onClick={reset}>
              Retry
            </button>
          </div>
        )}
      >
        <Flaky />
      </ErrorBoundary>,
      root,
    );

    await flush();
    expect(root.querySelector('#err-msg')?.textContent).toBe('Boom!');

    shouldThrow = false;
    (root.querySelector('#retry') as HTMLButtonElement).click();
    await flush();

    const btn = root.querySelector('#ok-btn') as HTMLButtonElement;
    expect(btn.textContent).toBe('Alive: 0');
    btn.click();
    await flush();
    expect(btn.textContent).toBe('Alive: 1');
  });

  it('unifies Web Components via defineElement() with typed attrs, Shadow DOM, and shared signal()', async () => {
    const shared = signal(1);

    function* Widget(props: { start?: number; label?: string }, ctx: Ctx) {
      let count = props.start ?? 0;
      for (props of ctx) {
        const s = shared();
        yield (
          <button onClick={() => (count += s)}>
            {props.label ?? 'WC'}: {count}
          </button>
        );
      }
    }

    defineElement('aster-test-widget', Widget, {
      props: { start: 'number', label: 'string' },
      shadow: true,
      styles: css`
        button {
          color: rgb(0, 113, 227);
        }
      `,
    });

    root.innerHTML = '<aster-test-widget start="10" label="Score"></aster-test-widget>';
    const el = root.querySelector('aster-test-widget') as any;
    const btn = el.shadowRoot.querySelector('button') as HTMLButtonElement;

    expect(btn.textContent).toBe('Score: 10');
    btn.click();
    await flush();
    expect(btn.textContent).toBe('Score: 11');

    // JS property sync
    el.label = 'Points';
    expect(btn.textContent).toBe('Points: 11');

    // Shared signal crosses Shadow boundary
    shared.set(5);
    await flush();
    btn.click();
    await flush();
    expect(btn.textContent).toBe('Points: 16');
  });

  it('claims real SSR HTML in-place via claim() with adjacent text, dynamic siblings, and preserved <input>', async () => {
    function* SsrIsland(props: { start: number }, ctx: Ctx) {
      let count = props.start;
      let draft = '';
      let showBanner = true;

      for (props of ctx) {
        yield (
          <div class="island-box" var:accent="#0071e3">
            {showBanner ? <p class="banner">Welcome</p> : null}
            <input id="revive-input" bind:value={draft} />
            <button id="revive-btn" class="btn" class:hot={count > 10} onClick={() => count++}>
              Clicks: {count} ({draft})
            </button>
          </div>
        );
      }
    }
    (SsrIsland as any).__asterSrc = '/src/SsrIsland.tsx#SsrIsland';

    // 1. Render real SSR HTML with revive: true (includes <!--aster-s:N-->...<!--aster:N--> anchors & merged class/var)
    const ssrHtml = renderToString(<SsrIsland start={10} />, { revive: true });
    root.innerHTML = ssrHtml;

    const islandEl = root.querySelector('aster-island') as Element;
    const preReviveBox = islandEl.querySelector('.island-box') as HTMLElement;
    const preReviveInput = islandEl.querySelector('#revive-input') as HTMLInputElement;
    const preReviveBtn = islandEl.querySelector('#revive-btn') as HTMLButtonElement;

    expect(preReviveBox.style.getPropertyValue('--accent')).toBe('#0071e3');
    expect(preReviveBtn.textContent).toBe('Clicks: 10 ()');

    // 2. Simulate user typing into the SSR <input> BEFORE Lazy Revival wakes the island up!
    preReviveInput.value = 'typed before wake';

    // 3. Claim existing SSR DOM in-place
    const inst = claim(SsrIsland, { start: 10 }, islandEl);
    dispose = () => inst.dispose();

    // Verify ZERO DOM replacement: exact same element instances!
    expect(islandEl.querySelector('.island-box')).toBe(preReviveBox);
    expect(islandEl.querySelector('#revive-input')).toBe(preReviveInput);
    expect(islandEl.querySelector('#revive-btn')).toBe(preReviveBtn);

    // Pre-typed input text was captured into `draft`!
    expect(preReviveInput.value).toBe('typed before wake');

    // Clicking the claimed button increments count AND updates class:hot reactively!
    preReviveBtn.click();
    await flush();
    expect(preReviveBtn.textContent).toBe('Clicks: 11 (typed before wake)');
    expect(preReviveBtn.classList.contains('hot')).toBe(true);
  });

  it('hot-swaps a mounted component in-place via __asterHmrAccept without unmounting siblings', async () => {
    function* Target() {
      for (;;) yield <span id="hmr-target">v1</span>;
    }
    (Target as any).__asterSrc = '/src/Target.tsx#Target';

    function* Sibling() {
      let clicks = 0;
      for (;;)
        yield (
          <button id="hmr-sib" onClick={() => clicks++}>
            Sib: {clicks}
          </button>
        );
    }

    function Page() {
      return (
        <div>
          <Sibling />
          <Target />
        </div>
      );
    }

    dispose = render(<Page />, root);
    const sibBtn = root.querySelector('#hmr-sib') as HTMLButtonElement;
    sibBtn.click();
    await flush();
    expect(sibBtn.textContent).toBe('Sib: 1');
    expect(root.querySelector('#hmr-target')?.textContent).toBe('v1');

    // Simulate Vite+ HMR update for /src/Target.tsx
    function* TargetV2() {
      for (;;) yield <span id="hmr-target">v2-hot</span>;
    }
    __asterHmrAccept('/src/Target.tsx', { Target: TargetV2 });

    expect(root.querySelector('#hmr-target')?.textContent).toBe('v2-hot');
    // Sibling state & DOM node survived untouched!
    expect(root.querySelector('#hmr-sib')).toBe(sibBtn);
    expect(sibBtn.textContent).toBe('Sib: 1');
  });

  it('warns in dev when a generator component exits on its first render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function* ForgotLoop() {
      return <p>Static</p>;
    }
    dispose = render(<ForgotLoop />, root);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ForgotLoop'));
    warn.mockRestore();
  });

  it('executes streaming SSR swap chunks cleanly in a real browser DOM', async () => {
    async function* AsyncWidget() {
      yield <span class="loading">Loading…</span>;
      await tick(10);
      yield <strong class="loaded">Streamed Ready!</strong>;
    }

    const stream = renderToStream(<AsyncWidget />, { revive: false });
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value);
    }

    // Parse body inner content and execute streamed inline <script> chunks in real DOM
    const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
    expect(bodyMatch).not.toBeNull();
    const frag = document.createRange().createContextualFragment(bodyMatch![1]);
    root.appendChild(frag);

    expect(root.querySelector('.loaded')?.textContent).toBe('Streamed Ready!');
    expect(root.querySelector('aster-b')).toBeNull();
    expect(root.querySelector('template')).toBeNull();
  });

  it('uses O(n log n) LIS keyed reconciliation for strictly minimal DOM moves on reorders', async () => {
    let setOrder!: (next: number[]) => void;

    function* TenList(_props: Record<string, any>, ctx: Ctx) {
      let order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      setOrder = (next: number[]) => {
        order = next;
        ctx.refresh();
      };
      for (;;) {
        yield (
          <ul id="lis-list">
            {order.map((n) => (
              <li key={n} data-k={n}>
                Item {n}
              </li>
            ))}
          </ul>
        );
      }
    }

    dispose = render(<TenList />, root);
    const ul = root.querySelector('#lis-list') as HTMLUListElement;
    const origNodes = new Map<number, Element>();
    for (const li of ul.querySelectorAll('li')) {
      origNodes.set(Number(li.getAttribute('data-k')), li);
    }

    // 1. Move last item (9) to the front -> LIS keeps 0..8 stationary, moving ONLY item 9 (3 nodes: start, li, end)
    const spy = vi.spyOn(ul, 'insertBefore');
    setOrder([9, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    await flush();
    expect([...ul.querySelectorAll('li')].map((el) => Number(el.getAttribute('data-k')))).toEqual([
      9, 0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(5);
    spy.mockClear();

    // 2. Move first item (9) back to the end -> moves ONLY item 9
    setOrder([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await flush();
    expect([...ul.querySelectorAll('li')].map((el) => Number(el.getAttribute('data-k')))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(5);
    spy.mockClear();

    // 3. Swap two middle items (2 and 7) -> moves ONLY 2 items
    setOrder([0, 1, 7, 3, 4, 5, 6, 2, 8, 9]);
    await flush();
    expect([...ul.querySelectorAll('li')].map((el) => Number(el.getAttribute('data-k')))).toEqual([
      0, 1, 7, 3, 4, 5, 6, 2, 8, 9,
    ]);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(10);

    // Every single original <li> DOM reference was preserved!
    for (const li of ul.querySelectorAll('li')) {
      const k = Number(li.getAttribute('data-k'));
      expect(li).toBe(origNodes.get(k));
    }
    spy.mockRestore();
  });

  it('mounts every /learn interactive lesson starter & solution cleanly in a real browser', () => {
    for (const lesson of LESSONS) {
      for (const variant of ['starter', 'solution'] as const) {
        const stage = document.createElement('div');
        root.appendChild(stage);
        const res = mountSandbox(lesson[variant], stage);
        expect(res.error, `${lesson.id}:${variant} error`).toBeNull();
        expect(stage.childNodes.length, `${lesson.id}:${variant} mounted`).toBeGreaterThan(0);
        res.dispose();
        stage.remove();
      }
    }
  });

  it('hydrates Astro SSR islands in-place via @fierst/aster/astro/client, preserves input & slots, and cleans up on astro:unmount', async () => {
    let cleaned = false;

    function* AstroCounter(props: { start: number; children?: any }, ctx: Ctx) {
      let count = props.start;
      let note = '';
      try {
        for (props of ctx) {
          yield (
            <section class="astro-box">
              <div class="slot-wrap">{props.children}</div>
              <input id="astro-note" bind:value={note} />
              <button id="astro-inc" onClick={() => count++}>
                Astro: {count} ({note})
              </button>
            </section>
          );
        }
      } finally {
        cleaned = true;
      }
    }

    // 1. Server render via @fierst/aster/astro/server with hydrate: 'visible'
    const ssr = await astroServer.renderToStaticMarkup(
      AstroCounter,
      { start: 5 },
      { default: '<em class="slotted">From Astro</em>' },
      { hydrate: 'visible', astroStaticSlot: true },
    );
    // SSR runs generator try/finally teardown; reset before verifying client astro:unmount cleanup
    expect(cleaned).toBe(true);
    cleaned = false;

    const island = document.createElement('astro-island');
    island.innerHTML = ssr.html;
    root.appendChild(island);

    const preSection = island.querySelector('.astro-box') as HTMLElement;
    const preInput = island.querySelector('#astro-note') as HTMLInputElement;
    const preBtn = island.querySelector('#astro-inc') as HTMLButtonElement;
    const preSlotted = island.querySelector('.slotted') as HTMLElement;

    // Simulate user typing before Astro hydrates on client:visible
    preInput.value = 'pre-hydrate';

    // 2. Hydrate via @fierst/aster/astro/client
    await hydrateAster(island)(
      AstroCounter,
      { start: 5 },
      { default: '<em class="slotted">From Astro</em>' },
      { client: 'visible' },
    );

    // Exact same DOM elements claimed in-place (including slotted Astro HTML!)
    expect(island.querySelector('.astro-box')).toBe(preSection);
    expect(island.querySelector('#astro-note')).toBe(preInput);
    expect(island.querySelector('#astro-inc')).toBe(preBtn);
    expect(island.querySelector('.slotted')).toBe(preSlotted);

    preBtn.click();
    await flush();
    expect(preBtn.textContent).toBe('Astro: 6 (pre-hydrate)');
    expect(cleaned).toBe(false);

    // 3. Astro View Transition unmount cleans up generator try/finally
    island.dispatchEvent(new Event('astro:unmount'));
    expect(cleaned).toBe(true);

    // 4. Verify client:only mounts cleanly into an empty island
    const onlyIsland = document.createElement('astro-island');
    root.appendChild(onlyIsland);
    await hydrateAster(onlyIsland)(AstroCounter, { start: 1 }, {}, { client: 'only' });
    expect(onlyIsland.querySelector('#astro-inc')?.textContent).toBe('Astro: 1 ()');
    onlyIsland.dispatchEvent(new Event('astro:unmount'));
  });
});
