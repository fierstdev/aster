export interface Lesson {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly subtitle: string;
  readonly concept: string;
  readonly explanation: string[];
  readonly task: string;
  readonly starter: string;
  readonly solution: string;
}

const executionLesson = `const history = signal([]);
const record = message => history.update(lines => [...lines, message]);
let finishRequest;

function Trace() {
  return <ol aria-label="Execution trace">{history().map((line, i) => <li key={i}>{line}</li>)}</ol>;
}

function* confirmation() {
  let accepted = false;
  try {
    while (!accepted) {
      record('Confirmation: next');
      yield <button onClick={() => { accepted = true; }}>Confirm</button>;
    }
    return true;
  } finally {
    record('Confirmation: finally');
  }
}

function* Workflow() {
  try {
    const accepted = yield* confirmation();
    if (accepted) yield <p>Confirmed</p>;
  } finally {
    record('Workflow: finally');
  }
}

async function* Request({ id }, ctx) {
  record('Request ' + id + ': next, yield loading');
  yield <p>Loading request {id}</p>;
  record('Request ' + id + ': next, waiting');
  await new Promise(resolve => {
    const abort = () => { record('Request ' + id + ': aborted'); resolve(); };
    if (ctx.signal.aborted) { abort(); return; }
    ctx.signal.addEventListener('abort', abort, { once: true });
    finishRequest = () => {
      ctx.signal.removeEventListener('abort', abort);
      resolve();
    };
  });
  if (!ctx.signal.aborted) yield <p>Loaded request {id}</p>;
}

function* App() {
  let id = 1, open = true;
  for (;;) yield <section>
    <button onClick={() => id++}>Change request</button>
    <button onClick={() => finishRequest?.()}>Finish request</button>
    <button onClick={() => { open = !open; }}>{open ? 'Leave workflow' : 'Open workflow'}</button>
    <Request id={id}/>
    {open && <Workflow/>}
    <Trace/>
  </section>;
}`;

export const LESSONS: readonly Lesson[] = [
  {
    id: 'plain-let-state',
    number: 1,
    title: 'Plain `let` State in `function*`',
    subtitle: 'No hooks, no setters, no compiler runes.',
    concept: 'function* + let',
    explanation: [
      'In Aster, stateful components are standard JavaScript generator functions (`function*`). Everything before the `for (;;)` loop runs once as setup; everything inside runs whenever an event fires.',
      'Local state is an ordinary `let` variable, and derived values are ordinary `const` declarations—always fresh, with zero `useState`, `.value`, or `() =>` thunks.',
    ],
    task: 'Add a `const doubled = count * 2` badge and a Reset button that sets `count = 0`.',
    starter: `function* App() {
  let count = 0;

  for (;;) {
    yield (
      <div class="demo-box">
        <button class="btn primary" onClick={() => count++}>
          Clicks: {count}
        </button>
      </div>
    );
  }
}`,
    solution: `function* App() {
  let count = 0;

  for (;;) {
    const doubled = count * 2;
    yield (
      <div class="demo-box">
        <button class="btn primary" onClick={() => count++}>
          Clicks: {count}
        </button>
        <span class="pill">2x = {doubled}</span>
        <button class="btn" onClick={() => (count = 0)} disabled={count === 0}>
          Reset
        </button>
      </div>
    );
  }
}`,
  },
  {
    id: 'props-and-ctx',
    number: 2,
    title: 'Props & `for (props of ctx)`',
    subtitle: 'Receiving live updates from a parent component.',
    concept: 'for (props of ctx)',
    explanation: [
      'When a stateful component accepts props, iterate `for (props of ctx)` instead of `for (;;)`. Every time the parent re-yields with new props, Aster resumes the loop with the latest `props` object.',
      'Child event callbacks (`on*`) passed from a parent automatically schedule a microtask refresh on the parent—no manual `ctx.refresh()` needed.',
    ],
    task: 'Pass `step={step}` from `App` to `Counter` and increment `count += props.step` inside `Counter`.',
    starter: `function* Counter(props, ctx) {
  let count = props.start ?? 0;

  for (props of ctx) {
    yield (
      <button class="btn primary" onClick={() => count++}>
        {props.label}: {count}
      </button>
    );
  }
}

function* App() {
  let label = 'Score';
  let step = 5;

  for (;;) {
    yield (
      <div class="demo-stack">
        <input bind:value={label} placeholder="Button label..." />
        <Counter start={10} label={label} />
      </div>
    );
  }
}`,
    solution: `function* Counter(props, ctx) {
  let count = props.start ?? 0;

  for (props of ctx) {
    const step = props.step ?? 1;
    yield (
      <button class="btn primary" onClick={() => (count += step)}>
        {props.label}: {count} (+{step})
      </button>
    );
  }
}

function* App() {
  let label = 'Score';
  let step = 5;

  for (;;) {
    yield (
      <div class="demo-stack">
        <div class="demo-box">
          <input bind:value={label} placeholder="Button label..." />
          <button class="btn" onClick={() => (step = step === 1 ? 5 : 1)}>
            Step: +{step}
          </button>
        </div>
        <Counter start={10} label={label} step={step} />
      </div>
    );
  }
}`,
  },
  {
    id: 'bindings-and-lists',
    number: 3,
    title: 'Two-Way `bind:*` & Keyed Lists',
    subtitle: 'Plain `.map()` with LIS minimal DOM moves.',
    concept: 'bind:value + key',
    explanation: [
      '`bind:value={draft}` and `bind:checked={item.done}` compile directly into getter/setter tuples—no boilerplate `value` + `onInput` handlers.',
      'Lists use plain JavaScript `.map()` with a `key` attribute. Under the hood, Aster reconciles arrays with an O(n log n) Longest Increasing Subsequence (LIS) diff so DOM nodes move minimally and never lose focus.',
    ],
    task: 'Add a checkbox with `bind:checked={item.done}` and show how many items remain open.',
    starter: `function* App() {
  let draft = '';
  const items = [
    { id: '1', title: 'Try plain let state', done: true },
    { id: '2', title: 'Add bind:checked to each row', done: false },
  ];

  const add = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    items.unshift({ id: String(Date.now()), title: draft.trim(), done: false });
    draft = '';
  };

  for (;;) {
    yield (
      <div class="demo-stack">
        <form class="demo-box" onSubmit={add}>
          <input bind:value={draft} placeholder="Add an item..." />
          <button class="btn primary" disabled={!draft.trim()}>Add</button>
        </form>
        <ul class="demo-list">
          {items.map((item) => (
            <li key={item.id} class="demo-row">
              <span class:done={item.done}>{item.title}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
}`,
    solution: `function* App() {
  let draft = '';
  const items = [
    { id: '1', title: 'Try plain let state', done: true },
    { id: '2', title: 'Add bind:checked to each row', done: false },
  ];

  const add = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    items.unshift({ id: String(Date.now()), title: draft.trim(), done: false });
    draft = '';
  };

  for (;;) {
    const remaining = items.filter((i) => !i.done).length;
    yield (
      <div class="demo-stack">
        <div class="demo-box">
          <strong>{remaining} remaining</strong>
        </div>
        <form class="demo-box" onSubmit={add}>
          <input bind:value={draft} placeholder="Add an item..." />
          <button class="btn primary" disabled={!draft.trim()}>Add</button>
        </form>
        <ul class="demo-list">
          {items.map((item) => (
            <li key={item.id} class="demo-row">
              <label class="demo-box">
                <input type="checkbox" bind:checked={item.done} />
                <span class:done={item.done}>{item.title}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    );
  }
}`,
  },
  {
    id: 'yield-star-flows',
    number: 4,
    title: 'Composable UI Flows with `yield*`',
    subtitle: 'Interactive sub-flows that return values directly.',
    concept: 'yield* delegation',
    explanation: [
      'Because components are real JavaScript generators, a helper generator can temporarily take over rendering via `yield*` and return a value straight back to the caller.',
      'Notice how `confirmDelete(title)` needs zero modal state flags, zero callback props, and zero extra framework runtime bytes.',
    ],
    task: 'Click Delete to see `yield* confirmDelete()` take over, then customize the confirmation prompt.',
    starter: `function* confirmDelete(title) {
  let choice = null;
  while (choice === null) {
    yield (
      <div class="demo-confirm">
        <span>Delete <strong>{title}</strong>?</span>
        <div class="demo-box">
          <button class="btn" onClick={() => (choice = false)}>Cancel</button>
          <button class="btn danger" onClick={() => (choice = true)}>Confirm</button>
        </div>
      </div>
    );
  }
  return choice;
}

function* App() {
  let asking = false;
  let status = 'Ready';

  for (;;) {
    if (asking) {
      const ok = yield* confirmDelete('Production API Key');
      asking = false;
      status = ok ? 'Key deleted!' : 'Cancelled safely.';
    }

    yield (
      <div class="demo-stack">
        <div class="demo-row">
          <span>Status: <strong>{status}</strong></span>
          <button class="btn danger" onClick={() => (asking = true)}>Delete Key</button>
        </div>
      </div>
    );
  }
}`,
    solution: `function* confirmDelete(title) {
  let choice = null;
  while (choice === null) {
    yield (
      <div class="demo-confirm">
        <span>Permanently revoke <strong>{title}</strong>?</span>
        <div class="demo-box">
          <button class="btn" onClick={() => (choice = false)}>Keep It</button>
          <button class="btn danger" onClick={() => (choice = true)}>Yes, Revoke</button>
        </div>
      </div>
    );
  }
  return choice;
}

function* App() {
  let asking = false;
  let status = 'Active';

  for (;;) {
    if (asking) {
      const ok = yield* confirmDelete('Production API Key');
      asking = false;
      status = ok ? 'Revoked' : 'Active (kept)';
    }

    yield (
      <div class="demo-stack">
        <div class="demo-row">
          <span>API Key: <strong>{status}</strong></span>
          <button
            class="btn danger"
            disabled={status === 'Revoked'}
            onClick={() => (asking = true)}
          >
            Revoke Key
          </button>
        </div>
      </div>
    );
  }
}`,
  },
  {
    id: 'signals-and-web-components',
    number: 5,
    title: 'Shared `signal()` & `defineElement()`',
    subtitle: 'One component mounts in JSX and as a Shadow DOM Custom Element.',
    concept: 'signal() + defineElement()',
    explanation: [
      'Use `let` for local state and `signal()` only when sharing state across components. Reading `step()` inside any `function*` automatically subscribes that generator.',
      'Wrap any component with `defineElement(tag, Comp, { props, shadow, styles })` to expose it as a standard Web Component—typed attribute coercion and Shadow DOM styles included.',
    ],
    task: 'Add a `+10` step button and watch both `<BadgeCounter />` and `<aster-learn-counter>` react in lockstep.',
    starter: `const step = signal(1);

function* BadgeCounter(props, ctx) {
  let count = props.start ?? 0;
  for (props of ctx) {
    const s = step();
    yield (
      <button class="btn primary" onClick={() => (count += s)}>
        {props.label ?? 'Count'}: {count} (+{s})
      </button>
    );
  }
}

defineElement('aster-learn-counter', BadgeCounter, {
  props: { start: 'number', label: 'string' },
  shadow: true,
  styles: css\`
    button {
      padding: 0.45rem 0.9rem;
      border-radius: 999px;
      background: #0055ff;
      color: #fff;
      border: none;
      cursor: pointer;
      font: inherit;
    }
  \`,
});

function* App() {
  for (;;) {
    const s = step();
    yield (
      <div class="demo-stack">
        <div class="demo-box">
          <button class="btn" class:primary={s === 1} onClick={() => step.set(1)}>+1</button>
          <button class="btn" class:primary={s === 5} onClick={() => step.set(5)}>+5</button>
        </div>
        <div class="demo-box">
          <BadgeCounter start={0} label="JSX" />
          <aster-learn-counter start="0" label="Shadow WC"></aster-learn-counter>
        </div>
      </div>
    );
  }
}`,
    solution: `const step = signal(1);

function* BadgeCounter(props, ctx) {
  let count = props.start ?? 0;
  for (props of ctx) {
    const s = step();
    yield (
      <button class="btn primary" onClick={() => (count += s)}>
        {props.label ?? 'Count'}: {count} (+{s})
      </button>
    );
  }
}

defineElement('aster-learn-counter', BadgeCounter, {
  props: { start: 'number', label: 'string' },
  shadow: true,
  styles: css\`
    button {
      padding: 0.45rem 0.9rem;
      border-radius: 999px;
      background: #0055ff;
      color: #fff;
      border: none;
      cursor: pointer;
      font: inherit;
    }
  \`,
});

function* App() {
  for (;;) {
    const s = step();
    yield (
      <div class="demo-stack">
        <div class="demo-box">
          <button class="btn" class:primary={s === 1} onClick={() => step.set(1)}>+1</button>
          <button class="btn" class:primary={s === 5} onClick={() => step.set(5)}>+5</button>
          <button class="btn" class:primary={s === 10} onClick={() => step.set(10)}>+10</button>
        </div>
        <div class="demo-box">
          <BadgeCounter start={0} label="JSX" />
          <aster-learn-counter start="0" label="Shadow WC"></aster-learn-counter>
        </div>
      </div>
    );
  }
}`,
  },
  {
    id: 'async-and-error-boundary',
    number: 6,
    title: '`async function*` & `<ErrorBoundary>`',
    subtitle: 'Straight-line loading states, auto-abort on prop change, and generator recovery.',
    concept: 'async function* + ErrorBoundary',
    explanation: [
      'Write `async function*` to yield a loading skeleton, `await` async work with `ctx.signal`, and yield the resolved view. Whenever props change, Aster aborts the stale run automatically.',
      'Because uncaught errors close a JavaScript generator (`done: true`), `<ErrorBoundary>` remounts a fresh generator instance cleanly when `reset()` is called.',
    ],
    task: 'Switch between Ada, Grace, and the Failing profile, then click Retry inside `<ErrorBoundary>`.',
    starter: `async function* ProfileCard(props, ctx) {
  yield <p class="demo-muted">Loading profile "{props.user}"...</p>;
  await new Promise((r) => setTimeout(r, 350));
  if (ctx.signal.aborted) return;
  if (props.user === 'broken') {
    throw new Error('Profile service returned 503');
  }
  yield (
    <div class="demo-row">
      <strong>{props.user}</strong>
      <span class="pill">Loaded via async function*</span>
    </div>
  );
}

function* App() {
  let user = 'Ada Lovelace';

  for (;;) {
    yield (
      <div class="demo-stack">
        <div class="demo-box">
          <button class="btn" onClick={() => (user = 'Ada Lovelace')}>Ada</button>
          <button class="btn" onClick={() => (user = 'Grace Hopper')}>Grace</button>
          <button class="btn danger" onClick={() => (user = 'broken')}>Trigger Error</button>
        </div>
        <ErrorBoundary
          fallback={(err, reset) => (
            <div class="demo-confirm">
              <span>{err.message}</span>
              <button class="btn primary" onClick={() => { user = 'Ada Lovelace'; reset(); }}>
                Retry
              </button>
            </div>
          )}
        >
          <ProfileCard user={user} />
        </ErrorBoundary>
      </div>
    );
  }
}`,
    solution: `async function* ProfileCard(props, ctx) {
  yield <p class="demo-muted">Fetching "{props.user}"...</p>;
  await new Promise((r) => setTimeout(r, 250));
  if (ctx.signal.aborted) return;
  if (props.user === 'broken') {
    throw new Error('503 Service Unavailable');
  }
  yield (
    <div class="demo-row">
      <strong>{props.user}</strong>
      <span class="pill">Verified</span>
    </div>
  );
}

function* App() {
  let user = 'Ada Lovelace';

  for (;;) {
    yield (
      <div class="demo-stack">
        <div class="demo-box">
          <button class="btn" class:primary={user === 'Ada Lovelace'} onClick={() => (user = 'Ada Lovelace')}>Ada</button>
          <button class="btn" class:primary={user === 'Grace Hopper'} onClick={() => (user = 'Grace Hopper')}>Grace</button>
          <button class="btn danger" onClick={() => (user = 'broken')}>Simulate 503</button>
        </div>
        <ErrorBoundary
          fallback={(err, reset) => (
            <div class="demo-confirm">
              <span>Recovered: {err.message}</span>
              <button class="btn primary" onClick={() => { user = 'Ada Lovelace'; reset(); }}>
                Reset &amp; Retry
              </button>
            </div>
          )}
        >
          <ProfileCard user={user} />
        </ErrorBoundary>
      </div>
    );
  }
}`,
  },
  {
    id: 'generator-execution',
    number: 7,
    title: 'Who advances the generator?',
    subtitle: 'Follow two components in the execution trace.',
    concept: 'next(), yield*, and finally',
    explanation: [
      'The confirmation pauses at yield until an update advances it. The async request advances past its loading view automatically, then pauses at await until you finish or replace it.',
      'Change the request before finishing it to see the old signal abort. Leave the workflow while Confirm is visible to see the delegated step clean up before its caller.',
    ],
    task: 'Add a trace entry after the request finishes so you can tell a completed request from an aborted one.',
    starter: executionLesson,
    solution: executionLesson.replace(
      'if (!ctx.signal.aborted) yield <p>Loaded request {id}</p>;',
      "if (!ctx.signal.aborted) {\n    record('Request ' + id + ': completed');\n    yield <p>Loaded request {id}</p>;\n  }",
    ),
  },
];
