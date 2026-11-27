# 02. Components, Local State, and Signals

Aster has a two-sentence state rule:

> **Use plain `let` inside `function*` for local component state. Use `signal()` only when sharing state across components.**

---

## 1. Stateless Components (`function`)

If a component only transforms props into markup, write an ordinary JavaScript function. It allocates zero generator frames and compiles straight to a static `<template>` slot patch:

```tsx
export function Badge({ text, tone = 'neutral' }: { text: string; tone?: string }) {
  return <span class={`pill ${tone}`}>{text}</span>;
}
```

---

## 2. Stateful Components (`function*`)

Add `*` to turn any function into a stateful component. Everything **before** `for (props of ctx)` runs once; everything **inside** runs on each update:

```tsx
import { type Ctx } from '@fierst/aster';

export function* Counter(
  props: { start?: number; label?: string },
  ctx: Ctx<{ start?: number; label?: string }>,
) {
  // Setup (runs once)
  let count = props.start ?? 0;

  try {
    // Render loop (runs on every event, prop change, or shared signal update)
    for (props of ctx) {
      const doubled = count * 2; // Always fresh — no computed() needed!

      if (count < 0) {
        yield <p>Count went negative!</p>;
        continue;
      }

      yield (
        <button onClick={() => count++}>
          {props.label ?? 'Clicks'}: {count} (2× = {doubled})
        </button>
      );
    }
  } finally {
    // Teardown (runs automatically when unmounted via gen.return())
    console.log('Counter unmounted');
  }
}
```

### Why There Is No Stale-Closure or Thunk Tax

- **No `()` or `.value`:** `count` is a native `number`.
- **No `() =>` thunks:** `disabled={!draft.trim()}` is evaluated directly on each yield, and the slot runtime diffs only the flat array of dynamic values.
- **No `<Show>` or `<For>`:** Plain `if / else` and `items.map((item) => <Row key={item.id} ... />)` work natively.
- **No manual `ctx.refresh()` for child callbacks:** Any `on*` function prop passed to a child component is automatically wrapped with the parent's microtask scheduler.

---

## 3. Two-Way Form Bindings (`bind:*`)

`@fierst/aster/vite` (`src/compiler.ts`) lowers `bind:value={draft}`, `bind:checked={task.done}`, and `bind:open={isOpen}` into getter/setter tuples automatically:

```tsx
export function* SearchBox() {
  let query = '';
  for (;;) {
    yield (
      <div>
        <input bind:value={query} placeholder="Search..." />
        <button disabled={!query.trim()} onClick={() => (query = '')}>
          Clear
        </button>
      </div>
    );
  }
}
```

---

Use a mutable local, a writable property, a signal held in a `const` or import, or an explicit `[get, set]` pair. For example, `const query = signal('')` works with `bind:value={query}`. Calling `query()` there supplies only its current value. Both compilers flag a known scalar at its JSX source location. A factory returning a binding is checked during server rendering or when the control mounts.

DOM handlers and custom binding setters can throw or return a rejecting promise. Aster forwards that failure to the nearest error boundary around the component that rendered the listener, or logs the event or binding name when there is no boundary. Return or await asynchronous callbacks to keep their errors in the event chain.

Use `on:keydown={event => event.key === 'Escape' && event.currentTarget.blur()}` for a native keyboard event. TypeScript infers both the event and the element. For application-defined events, augment the DOM interface `GlobalEventHandlersEventMap` with the event name and its `CustomEvent<Detail>` type to infer `event.detail` in JSX.

## 4. Shared Cross-Component State (`signal()`)

When multiple components (including Web Components) need to stay in sync, create a `signal()` in a shared module. Reading `step()` inside any `function*` automatically subscribes that generator:

```tsx
import { signal } from '@fierst/aster';

export const step = signal(1);

export function* StepDisplay() {
  for (;;) {
    // Automatically wakes up whenever step.set(...) is called anywhere
    yield <span>Current step: +{step()}</span>;
  }
}
```

---

## 5. Async Components (`async function*`)

Use `async function*` to express loading states and sequential fetches as straight-line code. Every component receives `ctx.signal` (`AbortSignal`), which aborts immediately on unmount:

```tsx
export async function* UserProfile(props: { id: string }, ctx: Ctx) {
  yield <div class="skeleton">Loading user #{props.id}…</div>;

  const res = await fetch(`/api/users/${props.id}`, { signal: ctx.signal });
  const user = await res.json();

  yield (
    <article>
      <h3>{user.name}</h3>
      <p>{user.bio}</p>
    </article>
  );
}
```

---

## 6. Spread Props, Style Objects, and JSX Comments

Standard JSX ergonomics work identically on components and intrinsic HTML elements:

```tsx
export function ActionButton({ label, ...rest }: { label: string; [key: string]: any }) {
  return (
    <button {...rest} style={{ fontWeight: 600 }}>
      {/* JSX comments are stripped at compile time with zero runtime cost */}
      {label}
    </button>
  );
}
```

---

## 7. Tree-Scoped Context (`createContext`, `provide`, `useContext`, `<Provider>`)

Use module-level `signal()` for client-wide state, and **tree-scoped Context** when passing data down a subtree or rendering concurrently on the server (so SSR requests never leak state across users):

```tsx
import { createContext, provide, useContext, Provider } from '@fierst/aster';

export const UserCtx = createContext<{ name: string } | null>(null);

export function Greeting() {
  const user = useContext(UserCtx);
  return <p>Hello, {user ? user.name : 'Guest'}</p>;
}

export function App({ user }: { user: { name: string } }) {
  // Option A: imperative inside a parent component
  provide(UserCtx, user);
  return <Greeting />;

  // Option B: declarative wrapper
  // return <Provider context={UserCtx} value={user}><Greeting /></Provider>;
}
```

### Automatic `async function*` Prop Restarts

Aster compares each prop with `Object.is`. Changing `id` in `<UserProfile id={selectedId} />` aborts the previous execution and starts a new one. Pass `ctx.signal` to the pending operation so it can settle and let the old generator reach its `finally` block.

Function props participate in this comparison. If a parent passes `load={loadProfile}`, replacing the loader restarts the child. Declare callbacks before the parent generator's render loop when they should keep the same identity across updates. An inline arrow inside the loop creates a fresh function on every render.

In lesson 7 on `/learn`, change a request while it is waiting, then leave a delegated confirmation. The execution trace shows the abort and the order of the two `finally` blocks.
