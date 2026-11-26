# ADR-0001: Generator Components (`function*`) and Slot-Compiled Templates

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Aster Core

## Context

Modern web frameworks generally fall into two rendering paradigms:

1. **Re-run-from-top functions (React):** Ergonomic local syntax, but requires a Virtual DOM, reconciliation overhead, hook rules (`useState`, `useEffect`, dependency arrays), and stale-closure traps.
2. **Setup-once fine-grained signals (Solid, Vue, Preact Signals):** Eliminates the VDOM, but forces signal wrappers (`count()`, `count.set()`, `.value`), thunk noise in JSX (`{() => !canAdd()}`), control-flow components (`<Show>`, `<Switch>`, `<For>`), and deep Proxy stores for local mutations.

Both paradigms treat JavaScript components as stateless functions that must invent framework-level state machines to survive across renders.

## Decision

Aster adopts **JavaScript Generator Components (`function*` and `async function*`)** paired with **compile-time Slot-Compiled `<template>` Patching**:

- **Stateful components** are standard ES6 `function*` generators. Everything before the `for (props of ctx)` loop runs once (setup); everything inside the loop runs on each update with fresh `props` and fresh derived `const` values.
- **Stateless/presentational components** remain plain `function` components (zero generator allocation overhead in large lists).
- **Local state** is plain JavaScript `let` variables—no `signal()`, no `()`, no `.value`, no `Proxy`, and no `() =>` thunks.
- **Lifecycle cleanup** uses native JavaScript `try / finally`, triggered deterministically when the runtime calls `gen.return()` on unmount.
- **Async UI flows** use `async function*` with a built-in `ctx.signal` (`AbortSignal`) that aborts immediately on unmount so pending `fetch()` calls cancel without teardown lag.
- **Multi-step interactive UI sub-flows** (confirmation dialogs, wizards, auth gates) leverage native `yield*` delegation, returning strongly typed values directly to the parent generator with 0 bytes of extra runtime code.
- **Shared cross-component state** uses a minimal (~35-line) `signal()` pub-sub primitive. While `gen.next()` executes, the runtime sets `activeObserver` to the component instance, automatically subscribing the paused generator to any shared `signal()` it reads.
- **DOM patching** compiles intrinsic JSX trees at dev/build time (`src/compiler.ts`) into hoisted `_tpl(html, bindings)` calls with precomputed integer child-index paths, cloning static HTML once via `template.content.cloneNode(true)` and diffing a flat array of dynamic slot values in place.

## Consequences

### Positive
- **Zero VDOM and ~3–4 KB gzipped client core:** Eliminates `store.ts`, `when()`, `not()`, `t`, `<Show>`, `<Switch>`, and `<Match>`.
- **100% standard TypeScript 7.x (`erasableSyntaxOnly`):** No custom SFC format, no custom LSP, and native TS 7 speed out of the box.
- **Automatic parent callback refresh:** Wrapping child `on*` props with the parent's microtask scheduler eliminates manual `ctx.refresh()` calls.
- **Keyed `.map()` lists:** Recognizing `.k` keys on arrays eliminates `<For>` boilerplate.

### Negative & Mitigations
- **Synchronous re-entrancy (`Generator is already executing`):** Mitigated by never calling `gen.next()` synchronously from an event or signal notification; all updates coalesce via `queueMicrotask()`.
- **Uncaught errors permanently close a generator (`done: true`):** Mitigated by having `<ErrorBoundary>` re-invoke the component function on `reset()` to create a fresh generator instance.
- **SSR infinite loops (`for (props of ctx)`):** Mitigated by `renderToString()` advancing the generator exactly once and immediately calling `gen.return()` in a `finally` block so server resources never leak.
- **Unfamiliarity:** `function*` is less common in frontend tutorials; mitigated by thorough guides and keeping plain `function` components first-class for stateless UI.
