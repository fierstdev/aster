# Contributing to Aster

Thank you for helping build Aster! Our guiding design rule is **ruthless minimalism**: leverage native browser standards first, keep `"dependencies": {}` at zero, and prefer subtraction over adding new abstractions.

---

## Local Development Setup

Aster uses **Vite+ (`vp`)** for formatting, linting, type checking, bundling, packaging, and testing:

```bash
# Install Vite+ if you don't have it yet
curl -fsSL https://vite.plus | bash

# Clone and install
vp install
vp dlx playwright install chromium   # One-time setup for Browser Mode tests
```

### Daily Commands

```bash
vp dev                   # Launch site & interactive /learn studio at http://localhost:5173/
vp check                 # Oxfmt + type-aware Oxlint + TypeScript 7 (`tsgo`)
vp check --fix           # Auto-format and apply safe lint fixes
vp test                  # Run both Node unit tests and headless Chromium Browser Mode tests
vp test --project=node   # Fast Node-only unit & SSR suite
vp test --project=browser # Playwright Chromium DOM suite
vp pack                  # Build publishable ESM + .d.mts into dist/
vp build                 # Build playground + aster-manifest.json
```

---

## Repository Map

- `src/runtime.ts` — Core generator runner (`function*` / `async function*`), slot patching, LIS keyed lists, `signal()`, Context, `<ErrorBoundary>`, `defineElement()`, `css`/`scope`, HMR registry.
- `src/compiler.ts` — Pure JS+JSX → hoisted `_tpl()` / `_slot()` / `_comp()` compiler + V3 source maps + automatic `__asterSrc` stamping.
- `src/vite.ts` — Vite+ / Rolldown plugin (`oxc: { jsx: 'preserve' }`, HMR, production `aster-manifest.json`).
- `src/ssr.ts` — Sync, async (`renderToStringAsync`), and out-of-order streaming (`renderToStream`) SSR.
- `src/revive.ts` — ~520 B Event-Delegated Lazy Revival client loader.
- `src/router.ts` — Browser-native Navigation API + `URLPattern` + View Transitions router.
- `src/astro/` — Zero-dependency Astro integration (`@fierst/aster/astro`, `/server`, `/client`).
- `bin/create.mjs` & `template/` — Zero-dependency project scaffolder (`vp dlx @fierst/aster`).
- `playground/` — Public site & interactive `/learn` tutorial studio.
- `tests/` — Vitest Node unit suites and `tests/browser/` real-Chromium DOM suite.

---

## Pull Request Guidelines

1. **Keep core unopinionated & zero-dependency:** Do not add runtime entries to `package.json` `"dependencies"`.
2. **Test real DOM behavior:** Runtime fixes or features should include a test in `tests/browser/runtime.browser.test.tsx`.
3. **Keep TypeScript 7 erasable:** All code must satisfy `"erasableSyntaxOnly": true` and produce clean `.d.mts` files via `vp pack` (no private unexported types leaked into public signatures).
4. **Update docs & `llms.txt`:** Any public API addition or behavioral change must update the corresponding guide and `llms.txt`. Significant architectural changes require an ADR under `docs/adr/`.
