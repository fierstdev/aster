import './styles.css';
import llmsTxt from '../llms.txt?raw';
import { signal, render, defineElement, css, ErrorBoundary, type Ctx } from '@fierst/aster';
import { Router, useLocation, type RouteDef } from '@fierst/aster/router';
import { renderToString } from '@fierst/aster/ssr';
import { LearnView } from './learn.tsx';

const globalStep = signal(1);

// =============================================================================
// Unified Component = Web Component (AND auto-stamped for Lazy Revival SSR)
// =============================================================================
export function* Counter(props: { start?: number; label?: string }, ctx: Ctx) {
  let count = props.start ?? 0;

  for (props of ctx) {
    const step = globalStep();
    const doubled = count * 2;

    yield (
      <div class="row">
        <button class="btn primary" onClick={() => (count += step)}>
          {props.label ?? 'Clicks'}: {count} (+{step})
        </button>
        <span class="pill">2x = {doubled}</span>
        <button class="btn" onClick={() => (count = props.start ?? 0)}>
          Reset
        </button>
      </div>
    );
  }
}

defineElement('aster-counter', Counter, {
  props: { start: 'number', label: 'string' },
  shadow: true,
  styles: css`
    .row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
      font-family: system-ui, sans-serif;
    }
    .btn {
      padding: 0.45rem 0.9rem;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      background: #fff;
      cursor: pointer;
      font-size: 0.86rem;
      font-weight: 500;
    }
    .btn.primary {
      background: #0055ff;
      color: #fff;
      border-color: #0055ff;
    }
    .pill {
      font-family: ui-monospace, monospace;
      font-size: 0.74rem;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #526071;
    }
  `,
});

// =============================================================================
// 1. Home Page (`/`) — Precision Landing + Live Hero Counter
// =============================================================================
const HERO_CODE = `export function* Counter() {
  let count = 0;

  for (;;) {
    const doubled = count * 2;
    yield (
      <button onClick={() => count++}>
        Clicks: {count} (2x = {doubled})
      </button>
    );
  }
}`;

function* HeroLiveCounter() {
  let count = 0;
  for (;;) {
    const doubled = count * 2;
    yield (
      <div class="row">
        <button class="btn primary" onClick={() => count++}>
          Clicks: {count} (2x = {doubled})
        </button>
        <button class="btn" onClick={() => (count = 0)} disabled={count === 0}>
          Reset
        </button>
      </div>
    );
  }
}

export function* HomeView() {
  let copied = false;

  const copyInstall = async () => {
    try {
      await navigator.clipboard?.writeText('vp dlx @fierst/aster my-app');
      copied = true;
    } catch {
      copied = false;
    }
  };

  for (;;) {
    yield (
      <div style="display:grid; gap:2.25rem">
        <section class="hero">
          <div>
            <span class="eyebrow">Aster by Fierst LLC · Zero Runtime Dependencies</span>
            <h1>The browser-native generator framework.</h1>
            <p class="lead">
              Write stateful UI with plain <code>let</code> inside <code>function*</code>, delegate
              multi-step flows with <code>yield*</code>, and ship automatic Lazy Revival SSR—powered
              by Vite+.
            </p>
            <div class="install-bar">
              <span>$ vp dlx @fierst/aster my-app</span>
              <button class="btn" onClick={copyInstall}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div class="row" style="margin-top:1.15rem">
              <a class="btn primary" href="/learn">
                Start Interactive Tutorial
              </a>
              <a class="btn" href="/showcase">
                Explore Showcase
              </a>
              <a class="btn" href="/docs">
                Docs &amp; llms.txt
              </a>
            </div>
          </div>

          <div class="card">
            <div class="between">
              <span class="mono-label">Counter.tsx</span>
              <span class="pill ok">Live · Zero VDOM</span>
            </div>
            <pre class="code">{HERO_CODE}</pre>
            <HeroLiveCounter />
          </div>
        </section>

        <section class="grid-4">
          <div class="grid-cell">
            <span class="eyebrow">01 · Reactivity</span>
            <h3>Plain `let` state</h3>
            <p class="muted">
              No `useState`, no `$state`, no `.value`, no `() =&gt;` thunks. Derived values are just
              `const`.
            </p>
          </div>
          <div class="grid-cell">
            <span class="eyebrow">02 · Flows</span>
            <h3>Native `yield*` UI</h3>
            <p class="muted">
              Confirmation dialogs and multi-step wizards return typed values directly to their
              caller.
            </p>
          </div>
          <div class="grid-cell">
            <span class="eyebrow">03 · Streaming SSR</span>
            <h3>Automatic Lazy Revival</h3>
            <p class="muted">
              Exported `function*` components auto-revive on first interaction (zero `$` syntax).
            </p>
          </div>
          <div class="grid-cell">
            <span class="eyebrow">04 · Standards</span>
            <h3>Unified Web Components</h3>
            <p class="muted">
              `defineElement()` turns any `function*` into a typed Shadow DOM Custom Element with
              zero rewrites.
            </p>
          </div>
        </section>
      </div>
    );
  }
}

// =============================================================================
// 2. Showcase Page (`/showcase`) — Web Components, SSR Output, Tasks + yield*, Native HTML
// =============================================================================
interface Task {
  id: string;
  title: string;
  done: boolean;
}

function* confirmDelete(title: string) {
  let choice: boolean | null = null;
  while (choice === null) {
    yield (
      <div class="confirm-box">
        <span>
          Delete <strong>{title}</strong>?
        </span>
        <div class="row">
          <button class="btn" onClick={() => (choice = false)}>
            Cancel
          </button>
          <button class="btn danger" onClick={() => (choice = true)}>
            Confirm
          </button>
        </div>
      </div>
    );
  }
  return choice;
}

function* TaskRow(
  props: { task: Task; onDelete: (id: string) => void; onToggle: () => void },
  ctx: Ctx,
) {
  let asking = false;
  for (props of ctx) {
    if (asking) {
      const confirmed = yield* confirmDelete(props.task.title);
      asking = false;
      if (confirmed) {
        props.onDelete(props.task.id);
        return;
      }
    }
    yield (
      <li class="task-item">
        <label class="row" style="cursor:pointer">
          <input type="checkbox" bind:checked={props.task.done} onChange={props.onToggle} />
          <span class:done={props.task.done}>{props.task.title}</span>
        </label>
        <button class="btn" onClick={() => (asking = true)}>
          Delete
        </button>
      </li>
    );
  }
}

export function* ShowcaseView() {
  let label = 'Normal Component';
  let draft = '';
  const tasks: Task[] = [
    { id: '1', title: 'LIS minimal-move keyed list reconciliation', done: true },
    { id: '2', title: 'Click Delete to test native `yield*` confirmation flow', done: false },
    { id: '3', title: 'Inspect automatic SSR `<aster-island>` + range anchors below', done: false },
  ];

  const add = (e: SubmitEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    tasks.unshift({ id: crypto.randomUUID(), title, done: false });
    draft = '';
  };

  const remove = (id: string) => {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx !== -1) tasks.splice(idx, 1);
  };

  for (;;) {
    const step = globalStep();
    const openCount = tasks.filter((t) => !t.done).length;
    const ssrPreview = renderToString(<Counter start={10} label={label} />, { revive: true });

    yield (
      <div style="display:grid; gap:1.5rem">
        <section class="card">
          <div class="between">
            <h2>Unified Component = Shadow DOM Web Component</h2>
            <div class="row">
              <span class="muted">Shared step:</span>
              <button class="btn" class:primary={step === 1} onClick={() => globalStep.set(1)}>
                +1
              </button>
              <button class="btn" class:primary={step === 5} onClick={() => globalStep.set(5)}>
                +5
              </button>
            </div>
          </div>
          <input bind:value={label} placeholder="Live label prop..." />
          <Counter start={10} label={label} />
          <aster-counter start="10" label={label}></aster-counter>
        </section>

        <section class="card">
          <div class="between">
            <h2>Tasks ({openCount} open)</h2>
            <span class="pill">LIS Keyed List + yield*</span>
          </div>
          <form onSubmit={add}>
            <input bind:value={draft} placeholder="Add a task..." />
            <button class="btn primary" disabled={!draft.trim()}>
              Add
            </button>
          </form>
          <ul class="list">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} onDelete={remove} onToggle={() => {}} />
            ))}
          </ul>
        </section>

        <section class="card">
          <h2>Automatic SSR Lazy Revival Output</h2>
          <p class="muted">
            Rendered live with{' '}
            <code>
              renderToString(&lt;Counter start=&#123;10&#125; /&gt;, &#123; revive: true &#125;)
            </code>
            —including range anchors for zero-flicker <code>claim()</code>:
          </p>
          <pre class="code">{ssrPreview}</pre>
        </section>

        <section class="card">
          <h2>Native 2026 HTML Controls (0 B JS)</h2>
          <p class="muted">
            <code>&lt;dialog closedby="any"&gt;</code> and <code>popover</code> are typed
            first-class in <code>@fierst/aster/jsx-runtime</code>.
          </p>
          <div class="row">
            <button class="btn" popovertarget="aster-tip">
              Toggle Native Popover
            </button>
            <button
              class="btn"
              onClick={() =>
                (document.getElementById('aster-modal') as HTMLDialogElement)?.showModal()
              }
            >
              Open Native Dialog
            </button>
          </div>
          <div id="aster-tip" popover="auto">
            <strong>Zero-JS Popover</strong> — light-dismisses on outside click or Esc natively.
          </div>
          <dialog id="aster-modal" closedby="any">
            <h3>Native &lt;dialog&gt;</h3>
            <p class="muted">
              Focus trapping, backdrop blur, and Esc-to-close are built into the browser.
            </p>
            <form method="dialog" style="margin-top:0.85rem; justify-content:flex-end">
              <button class="btn primary">Close</button>
            </form>
          </dialog>
        </section>
      </div>
    );
  }
}

// =============================================================================
// 3. Docs & `llms.txt` Page (`/docs`)
// =============================================================================
const CHEAT_SHEET = [
  ['Local State', 'let count = 0 inside function*', 'No useState, $state, or .value'],
  ['Props Loop', 'for (props of ctx) { yield ... }', 'Always fresh props & derived const'],
  ['Cleanup', 'try { ... } finally { ... }', 'No useEffect dependency arrays'],
  ['Multi-Step UI', 'const ok = yield* confirmDelete(t)', 'No modal flags or state machines'],
  ['Async & Cancel', 'async function* + ctx.signal', 'Auto-aborts & restarts on prop change'],
  ['Shared State', 'const step = signal(1)', 'Auto-subscribes reading generators'],
  ['SSR Context', 'createContext / provide / useContext', 'Request-isolated in edge workers'],
  ['Lists', 'items.map((x) => <Row key={x.id} />)', 'O(n log n) LIS minimal DOM moves'],
  ['Web Components', "defineElement('aster-x', Comp, opts)", 'Typed attrs + Shadow DOM + HMR'],
  [
    'Streaming SSR',
    'streamResponse(<App />, { revive: true })',
    'Automatic Lazy Revival + manifest',
  ],
];

export function* DocsView() {
  let copied = false;

  const copyLlms = async () => {
    try {
      await navigator.clipboard?.writeText(llmsTxt);
      copied = true;
    } catch {
      copied = false;
    }
  };

  for (;;) {
    yield (
      <div style="display:grid; gap:1.5rem">
        <section class="card">
          <span class="eyebrow">Quick Reference</span>
          <h2>Aster Cheat Sheet</h2>
          <table class="ref-table">
            <thead>
              <tr>
                <th>Concept</th>
                <th>Idiom</th>
                <th>Benefit</th>
              </tr>
            </thead>
            <tbody>
              {CHEAT_SHEET.map(([concept, idiom, benefit]) => (
                <tr key={concept}>
                  <td>
                    <strong>{concept}</strong>
                  </td>
                  <td>
                    <code>{idiom}</code>
                  </td>
                  <td class="muted">{benefit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section class="card">
          <div class="between">
            <div>
              <span class="eyebrow">AI Coding Fluency</span>
              <h2>llms.txt</h2>
            </div>
            <button class="btn primary" onClick={copyLlms}>
              {copied ? 'Copied llms.txt!' : 'Copy llms.txt'}
            </button>
          </div>
          <p class="muted">
            Shipped at the root of the <code>@fierst/aster</code> package so AI coding tools write
            idiomatic <code>function*</code> and <code>yield*</code> code instead of hallucinating
            React hooks.
          </p>
          <pre class="code">{llmsTxt}</pre>
        </section>
      </div>
    );
  }
}

// =============================================================================
// Root App Shell (Navigation API + Plain `<a href>` + View Transitions)
// =============================================================================
const routes: RouteDef[] = [
  { path: '/', component: HomeView },
  { path: '/learn', component: LearnView },
  { path: '/showcase', component: ShowcaseView },
  { path: '/docs', component: DocsView },
];

export function* App() {
  for (;;) {
    const pathname = useLocation().split('?')[0];

    yield (
      <div>
        <header class="site-header">
          <div class="header-inner">
            <a class="brand" href="/">
              <span class="brand-mark">*</span>
              <span>Aster</span>
              <span class="pill">by Fierst</span>
            </a>
            <nav class="nav">
              <a href="/" class:active={pathname === '/'}>
                Home
              </a>
              <a href="/learn" class:active={pathname === '/learn'}>
                Learn
              </a>
              <a href="/showcase" class:active={pathname === '/showcase'}>
                Showcase
              </a>
              <a href="/docs" class:active={pathname === '/docs'}>
                Docs &amp; llms.txt
              </a>
            </nav>
          </div>
        </header>

        <main class="page-wrap">
          <ErrorBoundary
            fallback={(err, reset) => (
              <section class="card" role="alert">
                <h3>Recovered from Generator Error</h3>
                <p class="muted">{String((err as Error)?.message ?? err)}</p>
                <div>
                  <button class="btn primary" onClick={reset}>
                    Reset Boundary
                  </button>
                </div>
              </section>
            )}
          >
            <Router
              routes={routes}
              fallback={() => (
                <section class="card">
                  <h2>404 — Not Found</h2>
                </section>
              )}
            />
          </ErrorBoundary>
        </main>
      </div>
    );
  }
}

render(<App />, document.getElementById('app')!);
