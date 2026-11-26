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
   Every exported stateful generator component (`export function* Name` or `export async function* Name`) is automatically stamped with its browser ESM module specifier (`Name.__asterSrc = '/path/File.js#Name'`). Plain stateless `function` components and unexported internal helpers are never stamped and ship **0 bytes** of client JS.
2. **Single-Boundary SSR Markers (`src/ssr.ts`):**
   When `renderToString(view, { revive: true })` encounters a stamped component, it emits `<aster-island data-aster-src="..." data-aster-props="...">...</aster-island>` and automatically suppresses nested `<aster-island>` wrappers for descendants so reviving an outer island claims the entire subtree cleanly.
3. **~520 B Inline Loader (`src/revive.ts`):**
   - Preloads modules on `pointerenter` / `focusin` via `<link rel="modulepreload">`.
   - Synchronously calls `e.preventDefault()` on `submit` before dynamically importing the component and runtime.
   - Calls `claim()` to bind precomputed integer slot paths directly onto existing SSR DOM in-place (zero replacement, zero flicker), preserves any text typed into `<input>` before revival, and replays the triggering event.
   - Supports explicit `data-aster-eager` opt-in for components that must boot on `DOMContentLoaded` before interaction.

## Consequences

### Positive
- **Zero manual syntax:** Write ordinary `export function* Counter(...)` and `<Counter start={10} />`—resumability just works.
- **O(1) startup cost:** Pages execute only the ~520 B delegated listener until the user interacts.
- **Stateless components stay 0 KB:** Presentational `function` components render to pure HTML and never load JS on the client.
