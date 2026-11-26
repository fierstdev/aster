# 05. Routing, Automatic Lazy Revival, and Error Boundaries

## 1. Browser-Native Routing (Zero `<Link>` Wrapper)

`src/router.ts` uses the native **Navigation API** (`window.navigation`), **`URLPattern`**, and **`document.startViewTransition()`**—automatically falling back to the History API in browsers that don't yet support Navigation API.

Just write standard HTML `<a href="/...">` tags:

```tsx
import { Router, useParams, type RouteDef } from '@fierst/aster/router';

function Home() {
  return <h1>Home</h1>;
}

function* Profile() {
  for (;;) {
    const { id } = useParams<{ id: string }>();
    yield <h1>User #{id}</h1>;
  }
}

const routes: RouteDef[] = [
  { path: '/', component: Home },
  { path: '/users/:id', component: Profile },
];

export function App(props: { url?: string }) {
  return (
    <main>
      <nav>
        <a href="/">Home</a>
        <a href="/users/42">User #42</a>
      </nav>
      <Router routes={routes} url={props.url} fallback={() => <h1>404</h1>} />
    </main>
  );
}
```

Same-origin `<a>` clicks are intercepted natively with smooth View Transitions, and work even with JavaScript disabled.

---

## 2. Automatic Event-Delegated Lazy Revival

You never wrap components in `island()`, `$`, or `client:visible`. When `@fierst/aster/vite` (`src/compiler.ts`) compiles a `.tsx` module:

- Every **exported stateful generator** (`export function* Counter`) is automatically stamped with `Counter.__asterSrc = '/path/File.js#Counter'`.
- Plain **stateless `function` components** stay pure HTML and ship **0 bytes** of JS.
- During SSR (`renderToString(view, { revive: true })` or `htmlResponse()`), Aster automatically wraps the outermost stamped generator in `<aster-island data-aster-src="..." data-aster-props="...">`.

On page load, only ~520 B of `@fierst/aster/revive` runs:
1. Hovering (`pointerenter`) or focusing (`focusin`) inside an island preloads its ES module via `<link rel="modulepreload">`.
2. On first `click`, `input`, `change`, or `submit`, only that island imports its module, calls `claim()` to attach directly onto the existing SSR DOM in-place, preserves any text already typed into inputs, and replays the event.
3. Need a component (like a live WebSocket ticker) to wake up before any user interaction? Add `data-aster-eager` to its container element.

---

### Production Manifest Resolution (`aster-manifest.json`)

During `vp build`, `@fierst/aster/vite` preserves exported generator chunks and emits `aster-manifest.json` mapping source module paths to real content-hashed Rolldown chunks (e.g. `"/src/Counter.tsx": "/assets/Counter-Dk8x2a.js"`). Pass that manifest (or standard Vite `.vite/manifest.json`) to `renderToString()` or `renderDocument()`:

```ts
import manifest from './dist/aster-manifest.json' with { type: 'json' };
import { htmlResponse } from '@fierst/aster/ssr';

return htmlResponse(<App />, { revive: true, manifest });
```

### In-Place HMR During `vp dev`

During development, `@fierst/aster/vite` injects self-accepting `import.meta.hot` handlers (`__asterHmrAccept`) into component modules so editing a `function*`, `function`, or `defineElement()` Web Component hot-swaps mounted instances in-place without reloading the page or resetting sibling state.

---

### Async & Out-of-Order Streaming SSR (`renderToStringAsync` & `renderToStream`)

When your tree contains `async function*` components:
- Use **`renderToStringAsync(view, opts)`** to await every async generator to completion and return a single resolved HTML string.
- Use **`renderToStream(view, opts)`** / **`streamResponse(view, opts)`** for instant TTFB: Aster streams the initial HTML shell with each `async function*`'s first yielded loading skeleton immediately, then flushes self-cleaning `<template>` + `<script>` swap chunks out-of-order as each async component resolves:

```ts
import { streamResponse } from '@fierst/aster/ssr';

export default {
  fetch(req: Request) {
    const url = new URL(req.url);
    return streamResponse(<App url={url.pathname + url.search} />, {
      title: 'Streaming Aster',
      revive: true,
    });
  },
};
```

---

## 3. Recovering Closed Generators with `<ErrorBoundary>`

In JavaScript, an uncaught error permanently closes a generator (`done: true`). Wrap subtrees in `<ErrorBoundary>` so calling `reset()` mounts a brand-new generator instance cleanly:

```tsx
import { ErrorBoundary } from '@fierst/aster';

export function SafePanel({ children }: { children?: any }) {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div role="alert">
          <p>Error: {String((err as Error)?.message ?? err)}</p>
          <button onClick={reset}>Retry</button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
```
