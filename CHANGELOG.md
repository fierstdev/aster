# Changelog

All notable changes to **Aster** are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - Unreleased

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
