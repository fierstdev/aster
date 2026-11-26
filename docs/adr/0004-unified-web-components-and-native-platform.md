# ADR-0004: Unified Web Components & Browser-Native Platform Primitives

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Aster Core

## Context

Frameworks routinely re-invent capabilities modern browsers already ship natively: custom `<Link>` wrappers for client routing, JS modal/popover portals, CSS-in-JS runtimes, and separate APIs for framework components vs. Custom Elements.

## Decision

Aster delegates to native Web Platform primitives wherever the browser already solves the problem:

1. **Unified Web Components (`defineElement`):**
   One `function*` component works identically inside an Aster TSX tree (`<Counter start={10} />`) and as a standard HTML Custom Element (`<aster-counter start="10"></aster-counter>`). `defineElement()` handles attribute type coercion (`string`, `number`, `boolean`, `json`), JS property getters/setters, Shadow DOM attachment, and `try / finally` cleanup on disconnect.
2. **Browser-Native Routing (`src/router.ts`):**
   Built on the **Navigation API** (`window.navigation`), **`URLPattern`**, and **`document.startViewTransition()`** (with graceful History API fallback). Standard `<a href="/...">` tags work with zero `<Link>` wrapper components.
3. **Native Styling (`scope` & `css`):**
   Uses native CSS `@scope` via `document.adoptedStyleSheets` for Light DOM isolation and `CSSStyleSheet` (`adoptedStyleSheets`) for Shadow DOM—zero PostCSS or CSS-in-JS runtime required.
4. **Native Interactive HTML Controls:**
   `src/jsx-runtime.ts` types native `<dialog closedby="any">`, Popover API (`popover`, `popovertarget`), and Invoker Commands (`commandfor`, `command`) first-class so modals, drawers, and menus require zero JS boilerplate.

## Consequences

### Positive

- **Minimal runtime footprint:** The entire core remains a few kilobytes gzipped.
- **Zero framework lock-in:** Components export cleanly as standard Web Components usable in plain HTML or any other framework.
