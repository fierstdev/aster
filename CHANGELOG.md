# Changelog

All notable changes to **Aster** are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-11-27

When upgrading, check two-way bindings and native JSX handler names against the stricter diagnostics. Async components now restart when a function prop changes identity. Define callbacks before the parent generator's render loop when an unrelated update should preserve a pending request.

- Preserve grouped JSX expressions and module-like text in playground previews. Support default-exported lesson components and diagnose unavailable imports.
- Route binding setter failures through the owning error boundary. Infer native event types for `on:*` handlers and SVG listeners.

- Add `ctx.afterRender(callback)` for one-time DOM work after a component mounts, updates, or claims its server HTML. The playground uses it to open dialogs, restore focus, and mount live previews.
- Refresh the learning editor's Compiled Slots tab as you type and show compiler diagnostics in the tab. Recover from mismatched server slot markers without duplicating text.

- Detach spread form bindings without clearing the field. Restart async generators when a function prop changes and preserve stable event callbacks across parent renders.
- Await registered cleanup during async SSR and report late failures during synchronous rendering or stream cancellation.
- Identify missing DOM paths during development claims and add an interactive generator execution trace to lesson 7.

- Report invalid two-way bindings at their JSX location in Vite and the learning editor. Support direct const signal bindings.
- Route thrown and rejected DOM event handlers to their component error boundary. Ignore late event completions after disposal.
- Infer DOM element types for JSX event targets and refs, validate native event names and bindings, and demonstrate delegated confirmation, cancellation, and retry in the playground showcase.

## [1.1.0] - 2026-11-27

- Preserve local bindings and public export aliases during slot compilation and revival. Match form attribute precedence across client mounts and SSR, preserve native submission through lazy activation, and wake keyboard-driven islands on the first keydown.
- Isolate cancellation and cleanup per client generator execution. Handle malformed route parameters and literal dots in fallback routes. Support a per-response CSP nonce for framework-generated document and stream scripts.

- The Vite and Astro integrations use Oxc to parse JSX and TSX by default. Exported arrow components and callbacks with nested default arguments receive revival metadata. Opening-tag comments remain supported, and source maps track copied JavaScript, multiline expressions, and generated binding accessors back to the original module.

## [1.0.0] - 2026-11-26

- Preserve JSX children, nested client components, and exported callbacks during island revival. Recreate captured callbacks in the owning client component and dispose mounted islands when they leave the document.

- Isolate SSR route hooks per tree and run component cleanup on completion, failure, and canceled streams.
- Preserve nested slot boundaries and literal text across sync, async, and streaming SSR. Tagged HTML templates now render on servers without a DOM.
- Emit browser-resolvable revival entries in the production manifest. Support explicit loader URLs, coalesce concurrent activations, and retry after a failed claim.
- Validate spread attribute names and encode language and inline configuration in the document serializer.
- Limit compiler export detection to code tokens. Verify the packed starter, SSR revival, and Astro integration in Chromium before publishing.

## [1.0.0-alpha.1] - 2026-11-24

Initial public alpha release of **Aster** — a browser-native, zero-VDOM web framework built on Vite+ (`vp`).

### Added

- **Generator Component Runtime (`@fierst/aster`):**
  - Stateful `function*` components with plain `let` local state, fresh `const` derivations, `for (props of ctx)` prop loop, and deterministic `try / finally` teardown.
  - Native `yield*` sub-generator UI flows with typed return values and automatic teardown propagation.
  - `async function*` components with automatic `ctx.signal` (`AbortSignal`) cancellation, prop-change restarts, and stale-run (`asyncRunId`) immunity.
  - Stateless `function` components with zero generator allocation and 0 B client JS in SSR.
  - Minimal pub-sub `signal()` for shared cross-component state and tree-scoped Context (`createContext`, `provide`, `useContext`, `<Provider>`) for SSR-safe isolation.
  - `<ErrorBoundary>` with epoch-keyed generator recovery on `reset()` and SSR fallback rendering.
  - Unified Web Components via `defineElement()` with typed attribute coercion (`string`, `number`, `boolean`, `json`), JS property sync, Shadow DOM `adoptedStyleSheets`, and HMR hot-updates.
  - Native styling helpers `scope` (CSS `@scope`) and `css` (`CSSStyleSheet`), plus runtime `html` tagged templates for zero-build mode.
  - Prefix/suffix + $O(n \log n)$ Longest Increasing Subsequence (LIS) keyed `.map()` reconciliation.
  - Context-aware `<template>` parsing for bare table tags (`<tr>`, `<td>`, `<option>`) and SVG child elements (`<circle>`, `<path>`, etc.).
- **JSX-to-Slot Compiler & Vite+ Plugin (`@fierst/aster/vite`):**
  - Delegates 100% of TypeScript 7.x stripping to Rust Oxc (`oxc: { jsx: 'preserve' }`).
  - Hoists static HTML into `_tpl()` and emits flat `_slot()` / `_comp()` calls with `{...spread}`, `{/* comments */}`, `bind:*` two-way bindings, style objects, `aria-*` booleans, and V3 VLQ source maps.
  - Automatic `__asterSrc` stamping on exported generators (zero manual `island()` or `$` syntax).
  - Dev-mode in-place HMR (`__asterHmrAccept`) and production `aster-manifest.json` hashed chunk emission.
- **Universal SSR & Automatic Lazy Revival (`@fierst/aster/ssr`, `@fierst/aster/revive`):**
  - `renderToString()`, `renderToStringAsync()`, `renderDocument()`, `htmlResponse()`, and out-of-order streaming `renderToStream()` / `streamResponse()`.
  - Full SSR attribute merging for `class:*`, `style:*`, `var:*`, `style` objects, and `{...spread}`.
  - Range-anchored in-place `claim()` preserving existing DOM nodes and pre-revival `<input>` values, plus ~520 B `installRevival()` loader with `pointerenter`/`focusin` preloading and `data-aster-eager` opt-in.
- **Browser-Native Router (`@fierst/aster/router`):**
  - Built on native Navigation API (`window.navigation`), `URLPattern`, and `document.startViewTransition()` with graceful History API fallback—standard `<a href>` tags work with zero `<Link>` wrapper.
- **First-Class Astro Integration (`@fierst/aster/astro`):**
  - Zero-dependency Astro server & client renderers supporting `client:load`, `client:idle`, `client:visible`, `client:media`, `client:only="aster"`, default & named `<astro-slot>`s, `astro:unmount` View Transition cleanup, and multi-framework `include`/`exclude` filters.
- **Scaffolder, Interactive Studio, & AI Reference:**
  - Zero-dependency project scaffolder (`vp dlx @fierst/aster my-app` / `create-aster`).
  - Multi-page `aster.fierst.dev` playground with 6-chapter Svelte-style interactive `/learn` studio.
  - Root `llms.txt` reference for AI coding assistants.
  - Dual Vitest suite (Node unit tests + real-Chromium Playwright Browser Mode tests).
