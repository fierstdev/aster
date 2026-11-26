# ADR-0005: Streaming SSR, Range-Anchored `claim()`, and Tree-Scoped Context

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Aster Core

## Context

Three production correctness issues emerge when running a generator-based framework across multi-tenant edge isolates (Cloudflare Workers / `workerd`) and real browsers:

1. **SSR Text/Sibling Merging Breaks Static Path Claiming:** Removing `<!--aster:i-->` markers during SSR allows the browser HTML parser to merge adjacent text nodes and shifts sibling indices whenever a dynamic slot precedes an interactive element—breaking `claim()` path lookups.
2. **Async Components & Streaming:** `async function*` components naturally model loading skeletons followed by resolved data, but synchronous `renderToString()` cannot await them, and prop changes on mounted `async function*` instances must abort stale fetches cleanly.
3. **Concurrent Edge Request Isolation:** Module-level `signal()` state is shared across requests inside a single edge isolate; server-rendered user/theme/session state must be strictly isolated per render tree.

## Decision

1. **Range-Anchored Claiming (`<!--aster-s:i-->...<!--aster:i-->`):**
   - Only inside revived islands (`opts.revive && opts._inIsland`), SSR brackets dynamic node slots with `<!--aster-s:i-->...<!--aster:i-->`. Outside revived islands, SSR emits clean comment-free HTML.
   - `claimPathToNode()` skips balanced `<!--aster-s:N-->...<!--aster:N-->` interiors so precomputed integer slot paths resolve 1-to-1 against the live SSR DOM regardless of adjacent text or preceding dynamic elements.
   - `patchNodeSlot()` adopts existing SSR Text nodes and nested `SlotView`/`CompView` ranges in-place, preserving pre-revival `<input>` values and falling back cleanly if SSR markup mismatches.
   - Opening-tag SSR attribute merging consolidates static `class`/`style` with `class:*`, `style:*`, `var:*`, `style` objects, and `{...spread}` so SSR renders with zero FOUC and zero duplicate attributes.
2. **Context-Aware `<template>` Parsing:**
   - `getTemplateEl()` detects leading table tags (`<tr>`, `<td>`, `<col>`, `<option>`, etc.) and bare SVG child tags (`<path>`, `<circle>`, `<g>`, etc.), parsing them inside their proper HTML/SVG container wrapper before transferring children into `template.content` with true DOM/SVG namespaces.
3. **Async & Out-of-Order Streaming SSR + Prop Restarts:**
   - `renderToStringAsync()` awaits `async function*` components to completion.
   - `renderToStream()` / `streamResponse()` returns a Web-Standard `ReadableStream<Uint8Array>` that flushes the initial HTML shell + loading skeletons (`<aster-b id="aster-b-N">`) immediately and streams self-cleaning `<template>` + `<script>` swap chunks out-of-order as each `async function*` resolves.
   - On the client, `mountComponent.update()` shallow-compares props on `async function*` components—restarting with a fresh `AbortController` when props genuinely change and skipping restarts on identical props.
4. **Tree-Scoped Context (`createContext`, `provide`, `useContext`, `<Provider>`):**
   - Backed by a prototype-chained object (`Object.create(parentContext)`) per component instance on both client and SSR (`_runWithContext`), guaranteeing zero state leakage across overlapping concurrent `async function*` SSR requests.
5. **Vitest Browser Mode (`vite-plus/test/browser-playwright`):**
   - `vite.config.ts` splits `vp test` into a fast `node` project and a real headless Chromium `browser` project (`tests/browser/**/*.test.tsx`) so DOM claiming, `yield*`, table/SVG parsing, Shadow DOM Web Components, HMR, and streaming swap scripts are continuously verified in a real browser engine.

## Consequences

### Positive

- **Zero-flicker Lazy Revival:** Pre-typed `<input>` text, exact element references, and dynamic classes/CSS variables survive SSR → revival seamlessly.
- **Safe Multi-Tenant Edge SSR:** Tree-scoped Context and `renderToStream()` make Aster production-safe on Cloudflare Workers (`workerd`).
- **Real-Browser Confidence:** Every runtime guarantee is verified in real Chromium via `vp test`.
