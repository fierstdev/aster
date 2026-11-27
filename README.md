# Aster

**A tiny, browser-native, zero-VDOM web framework powered by JavaScript Generator Components (`function*`), Slot-Compiled Templates, Unified Web Components, and Automatic Lazy Revival—built on Vite+ (`vp`).**

- **Plain `let` local state:** Write `let count = 0` and `count++` inside `function*`—no `()`, no `.value`, no `Proxy`, no `() =>` thunks, no `<Show>` / `<For>`.
- **Native `yield*` UI flows:** Delegate confirmations, modals, and multi-step wizards with typed return values and zero state-machine boilerplate.
- **Unified Web Components:** Wrap any `function*` with `defineElement()` to expose it as a standard Custom Element with typed attributes and JS property sync.
- **Automatic Lazy Revival:** `@fierst/aster/vite` automatically stamps exported `function*` components during compile; SSR islands wake up on first interaction with zero `$` syntax and zero `island()` wrappers.
- **Browser-Native Platform First:** Standard `<a href>` routing via Navigation API + `URLPattern` + View Transitions, native `<dialog closedby="any">` / Popover / `commandfor`, and CSS `@scope` / `CSSStyleSheet`.
- **Vite+ (`vp`) by Default, Zero Runtime Dependencies:** The Vite and Astro integrations parse JSX and TSX with Oxc. Aster emits slot templates and maps expressions to the original source. Vite strips TypeScript and Rolldown bundles the result.

## Quick Start

```bash
# Scaffold a new project
vp dlx @fierst/aster my-app && cd my-app && vp install && vp dev

# Or work inside this repo
vp install
vp dev       # Launch site & interactive /learn studio at http://localhost:5173/
vp test      # Run Vitest suite
vp check     # Format + lint + TypeScript 7 check
vp pack      # Build publishable ESM + .d.ts into dist/
```

Generated apps include an optional AsterUI command. Run `npm run ui -- add button` from the app, install the dependencies listed by the CLI, and import `Button` from `./ui/button` in `src/main.tsx`. The starter loads `src/ui/theme.css` as soon as it exists. Plain Aster apps can use the starter without installing any UI components.

## Layout

- `src/` — `index.ts`, `runtime.ts`, `jsx-runtime.ts`, `router.ts`, `ssr.ts`, `revive.ts`, `compiler.ts`, `vite.ts`, `astro/` (`index.ts`, `server.ts`, `client.ts`, `slots.ts`)
- `playground/` — Multi-page `aster.fierst.dev` site & Svelte-style interactive `/learn` studio
- `llms.txt` — Concise AI coding assistant reference (shipped in npm package)
- `tests/` — Vitest Node unit suites + real-Chromium Browser Mode suite (`tests/browser/runtime.browser.test.tsx`)
- `bin/` & `template/` — Zero-dependency `create-aster` project scaffolder
- `docs/` — [5 Guides & 5 ADRs](./docs/README.md)
