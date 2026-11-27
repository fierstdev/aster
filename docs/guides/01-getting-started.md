# 01. Getting Started with Aster (Vite+)

Aster pairs a **~3–5 KB browser-native generator runtime** with **Vite+ (`vp`)** for zero-config development, testing, type checking, and production builds—with zero runtime dependencies and zero opinions about your backend.

---

## 1. Install Vite+ (`vp`)

If you don't already have Vite+ installed globally:

```bash
# macOS / Linux
curl -fsSL https://vite.plus | bash

# Windows (PowerShell)
irm https://vite.plus/ps1 | iex
```

---

## 2. Scaffold a New App in 30 Seconds

```bash
vp dlx @fierst/aster my-app
cd my-app
vp install
vp dev
```

_(From inside the Aster repo itself, you can also run `node bin/create.mjs my-app`.)_

---

## 3. Run the Framework Playground & Tests

From the `aster` repository root:

```bash
vp install      # Installs the single `vite-plus` devDependency
vp dev          # Launches the interactive playground at http://localhost:5173/
vp dlx playwright install chromium  # One-time setup for Browser Mode tests
vp test         # Runs both Node unit tests and real-Chromium Browser Mode tests
vp check        # Runs Oxfmt + Oxlint + TypeScript 7 type checking in one pass
vp pack         # Builds publishable ESM + .d.ts bundles into dist/
```

---

## 4. Use Aster in Any Vite+ App

Add `aster()` from `@fierst/aster/vite` to your `vite.config.ts`:

```ts
import { defineConfig } from 'vite-plus';
import aster from '@fierst/aster/vite';

export default defineConfig({
  plugins: [aster()],
});
```

Set `"jsx": "react-jsx"` and `"jsxImportSource": "@fierst/aster"` in `tsconfig.json`, and write standard `.tsx` components:

```tsx
import { render } from '@fierst/aster';

export function* Counter() {
  let count = 0;
  for (;;) {
    yield <button onClick={() => count++}>Clicks: {count}</button>;
  }
}

render(<Counter />, document.getElementById('app')!);
```

The Vite plugin parses JSX and TSX with **Oxc** before Vite strips TypeScript. Aster lowers JSX into hoisted template slots, maps expressions back to their original positions, and stamps exported generator components for lazy revival. The Astro integration uses the same compiler.

---

## 5. Universal Edge SSR (`workerd` or Any Fetch Server)

`@fierst/aster/ssr` depends solely on Web Standards (`Request`, `Response`, `AbortController`):

```ts
import manifest from './dist/aster-manifest.json' with { type: 'json' };
import { htmlResponse } from '@fierst/aster/ssr';
import { App } from './app.tsx';

export default {
  fetch(req: Request) {
    const url = new URL(req.url);
    return htmlResponse(<App url={url.pathname + url.search} />, {
      title: 'My App',
      revive: true,
      manifest,
    });
  },
};
```
