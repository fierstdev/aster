# 01. Getting Started with Aster (Vite+)

Aster pairs a browser-native generator runtime with Vite+ for development, testing, type checking and production builds. Use Node 20.19 or later for the package. The repository uses the version listed in `.node-version`.

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

The CLI names are `aster` and `create-aster`. The default target is `my-aster-app`. Use an empty directory. The optional `--force` flag overwrites matching starter files in an existing directory. Scaffolding copies files and leaves dependency installation to you.

Open the URL printed by `vp dev`. Edit `src/main.tsx`, then click the button from `src/counter.tsx` to see local state persist. To add an optional AsterUI button, run `npm run ui -- add button`, install the dependencies printed by the CLI and import `Button` from `./ui/button`. Run `vp build` to create the static client site in `dist/` and `vp preview` to try it locally. Configure your static host to serve `index.html` for client routes.

---

## 3. Run the Framework Playground & Tests

From the `aster` repository root:

```bash
vp install      # Install repository dependencies
vp dev          # Launches the interactive playground at http://localhost:5173/
vp dlx playwright install chromium  # One-time setup for Browser Mode tests
vp test         # Runs both Node unit tests and real-Chromium Browser Mode tests
vp check        # Runs Oxfmt + Oxlint + TypeScript 7 type checking in one pass
vp pack         # Builds publishable ESM + .d.ts bundles into dist/
```

---

## 4. Use Aster in Any Vite+ App

Install `@fierst/aster` in the app (for example, `npm install @fierst/aster`). Add `aster()` from `@fierst/aster/vite` to your `vite.config.ts`:

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

Use a TSX server entry in a Fetch-based host. Build and serve the client assets first, then import that build's manifest in your server bundle.

```tsx
import manifest from '../dist/aster-manifest.json' with { type: 'json' };
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

For a split client/server build, keep browser-safe components in shared modules. Import the island modules from the client entry (a side-effect import such as `import './Counter.tsx'` lets the plugin discover its exports). Run `vp build` for the client, then `vp build --ssr src/server.tsx --outDir dist-server` for a server entry at that path. Resolve the manifest import relative to the entry file, for example `../dist/aster-manifest.json` from `src/server.tsx`. Serve the contents of `dist/` at the configured public base. Route document requests to your Fetch handler and asset requests to the client files. The handler above is a Fetch-host module, so a Node HTTP server needs its own Request/Response adapter.
