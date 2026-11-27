# ADR-0003: Automatic Event-Delegated Lazy Revival (Zero-Syntax Resumability)

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Aster Core

## Context

Traditional SSR hydration downloads and executes all interactive component JavaScript on initial page load. Closure-level resumability (e.g., Qwik) avoids upfront hydration but requires `$` syntax annotations, custom AST chunk-splitters, and manual serialization rules.

Any manual wrapper (such as `island(Component, '/path.js')`) violates Aster's "it just works" principle.

## Decision

Aster implements **100% Automatic Event-Delegated Lazy Revival** at the **component boundary** with zero new syntax:

1. **Automatic Compile-Time Stamping (`src/compiler.ts` & `src/vite.ts`):**
   The compiler records the module and export name for named generator components. It also records ownership metadata for exported stateless components and callbacks so the server can identify which client module can recreate interactive content.
2. **Single-Boundary SSR Markers (`src/ssr.ts`):**
   When `renderToString(view, { revive: true })` encounters a stamped component, it emits `<aster-island data-aster-src="..." data-aster-props="...">...</aster-island>` and automatically suppresses nested `<aster-island>` wrappers for descendants so reviving an outer island claims the entire subtree cleanly.
3. **Delegated loader (`src/revive.ts`):** The generated document imports `installRevival` from the loader module.
   - Preloads modules on `pointerenter` / `focusin` via `<link rel="modulepreload">`.
   - Synchronously calls `e.preventDefault()` on `submit` before dynamically importing the component and runtime.
   - Calls `claim()` to attach bindings to matching server DOM and replay the triggering event. A mismatched slot can require remounting the affected range.
   - Supports explicit `data-aster-eager` opt-in for components that must boot on `DOMContentLoaded` before interaction.

## Consequences

### Positive

- **Zero manual syntax:** Write ordinary `export function* Counter(...)` and `<Counter start={10} />`—resumability just works.
- **Deferred execution:** The loader installs document listeners. Component and runtime imports run when an island wakes, including during eager activation.
- **Static output:** A stateless component producing only presentational HTML can render without its own island.
