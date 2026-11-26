# ADR-0002: Vite+ (`vp`) Default Toolchain & Unopinionated Browser-Native Core

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Aster Core

## Context

Maintaining a custom zero-dependency TypeScript stripper, custom dev server, Service Worker transpiler, and dual `.ts`/`.js` files creates continuous tooling drag and edge-case bugs that distract from the framework's actual innovations. Meanwhile, **Vite+ (`vp`)** unifies Vite, Rolldown, Oxc (parser, transformer, linter, formatter), Vitest, tsdown (`vp pack`), and Node/package-manager environment management behind a single `vite-plus` dependency and one `vite.config.ts`.

## Decision

Aster adopts **Vite+ (`vp`) as its first-class default toolchain**, while keeping the **runtime 100% browser-native, zero-dependency, and completely unopinionated** about backends, databases, authentication, or CSS methodologies:

1. **Oxc Handles 100% of TypeScript (`oxc: { jsx: 'preserve' }`):**
   `src/vite.ts` configures Vite+'s Rust Oxc transformer to strip all TypeScript syntax with full spec fidelity while preserving JSX. Aster's `src/compiler.ts` only performs pure JS+JSX → `_tpl()` / `_slot()` / `_comp()` lowering, `bind:*` tuple expansion, and automatic `__asterSrc` stamping—eliminating every line of hand-rolled TypeScript stripping.
2. **One Unified Config (`vite.config.ts`):**
   `vp dev` (HMR), `vp build` (Rolldown), `vp pack` (tsdown library ESM + `.d.ts` output), `vp test` (Vitest), and `vp check` (Oxfmt + Oxlint + TS 7 type checking) all live in a single config file with a single `vite-plus` devDependency.
3. **Zero Runtime Dependencies & Zero Backend Opinions:**
   `package.json` ships `"dependencies": {}`. The packed ESM outputs (`dist/index.mjs`, `dist/router.mjs`, `dist/ssr.mjs`, `dist/revive.mjs`) run natively in browsers, Cloudflare `workerd`, or any Web-Standard server—and can even be dropped into a static HTML page via CDN / `<script type="importmap">` using `html`...`` tagged templates without Vite+ at all.

## Consequences

### Positive
- **Zero syntax edge cases:** Rust Oxc handles all TypeScript 7.x syntax natively.
- **Full npm & CSS ecosystem parity:** Any npm package, CSS Module, Lightning CSS, Tailwind, or Cloudflare Vite plugin works out of the box.
- **Minimal, maintainable codebase:** 8 focused files in `src/` instead of fighting custom CLI and transpiler plumbing.

### Negative & Mitigations
- **Requires `vp` for `.tsx` development:** Mitigated by `vp`'s single-line installer (`curl -fsSL https://vite.plus | bash`), automatic Node management, and `vp pack` emitting standalone browser ESM modules for zero-build `html`...`` usage.
