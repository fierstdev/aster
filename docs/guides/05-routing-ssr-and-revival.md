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

Literal paths, named segments such as `/users/:id`, and wildcards work with the fallback matcher. Route parameters are decoded when possible. A malformed percent escape keeps the captured text available to the route.

---

## 2. Automatic Event-Delegated Lazy Revival

You never wrap components in `island()`, `$`, or `client:visible`. When `@fierst/aster/vite` (`src/compiler.ts`) compiles a `.tsx` module:

- Every **exported stateful generator** (`export function* Counter`) is automatically stamped with `Counter.__asterSrc = '/path/File.js#Counter'`.
- An exported stateless component can also own an island when the client needs to recreate an event handler or a child composition. Static HTML needs no activation.
- During SSR (`renderToString(view, { revive: true })` or `htmlResponse()`), Aster automatically wraps the outermost stamped generator in `<aster-island data-aster-src="..." data-aster-props="...">`.

On page load, the delegated listener from `@fierst/aster/revive` runs:

1. Hovering (`pointerenter`) or focusing (`focusin`) inside an island preloads its ES module via `<link rel="modulepreload">`.
2. A first `keydown`, `click`, `input`, `change`, or `submit` wakes the island. Aster claims the existing DOM and preserves typed input. A deferred native form submission runs browser validation and gives the component's submit handler the original submit button and the opportunity to cancel.
3. Need a component (like a live WebSocket ticker) to wake up before any user interaction? Add `data-aster-eager` to its container element.

---

### Production Manifest Resolution (`aster-manifest.json`)

During `vp build`, `@fierst/aster/vite` preserves exported generator chunks and emits `aster-manifest.json` mapping source module paths to real content-hashed Rolldown chunks (e.g. `"/src/Counter.tsx": "/assets/Counter-Dk8x2a.js"`). Pass that manifest (or standard Vite `.vite/manifest.json`) to `renderToString()` or `renderDocument()`:

```ts
import manifest from './dist/aster-manifest.json' with { type: 'json' };
import { htmlResponse } from '@fierst/aster/ssr';

return htmlResponse(<App />, { revive: true, manifest });
```

Serve the client build at its configured base URL. The Aster manifest includes the loader and runtime chunks as well as component entries. Include each interactive component module in the client build. Keep island modules free of application startup side effects since the browser imports them on demand.

For a hand-built client or a standard Vite manifest without those entries, pass browser module URLs in `revivalUrl` and `runtimeUrl`, or provide an import map for `@fierst/aster/revive` and `@fierst/aster`. A failed activation dispatches a bubbling `aster:revival-error` event with the error in `detail`; the next interaction attempts activation again. When installing the loader manually, call the function returned by `installRevival()` to remove its delegated listeners.

SSR route hooks read the nearest router's URL and parameters. Async components on Node can read context across an `await`. On runtimes without `AsyncLocalStorage`, capture context before the first `await` or use the route props. Components can register resource cleanup using `ctx.onCleanup()` on both server and client. Stream consumers can cancel the reader to signal pending generators through `ctx.signal`.

Async SSR awaits promises returned by registered cleanup callbacks. If cleanup fails, the render promise or active stream surfaces an `AggregateError`. Synchronous SSR logs late cleanup rejections, and a canceled stream logs cleanup failures after its reader has gone away.

Each client generator execution has its own `ctx.signal`. After a prop restart or unmount, that execution continues to see its aborted signal, including after an `await`. A cleanup registered on an already aborted context runs immediately. Client teardown reports cleanup failures to the console and continues disposing the component.

Island props support plain data, arrays, dates, query parameters, JSX templates, and exported child components. A named callback exported from a compiled client module travels as a module reference. A callback that closes over component locals is recreated by running its owning client component. Include those modules in the client build. Routed islands also restore their matched URL and parameters.

Only pass public data across an island boundary. A closure created exclusively in a server request handler has no browser implementation. SSR reports its prop path, as it does for cyclic input or unsupported class instances.

### In-Place HMR During `vp dev`

During development, `@fierst/aster/vite` injects self-accepting `import.meta.hot` handlers (`__asterHmrAccept`) into component modules so editing a `function*`, `function`, or `defineElement()` Web Component hot-swaps mounted instances in-place without reloading the page or resetting sibling state.

---

### Async & Out-of-Order Streaming SSR (`renderToStringAsync` & `renderToStream`)

When your tree contains `async function*` components:

- Use **`renderToStringAsync(view, opts)`** to await every async generator to completion and return a single resolved HTML string.
- Use **`renderToStream(view, opts)`** / **`streamResponse(view, opts)`** for instant TTFB: Aster streams the initial HTML shell with each `async function*`'s first yielded loading skeleton immediately, then flushes self-cleaning `<template>` + `<script>` swap chunks out-of-order as each async component resolves:

```ts
import manifest from './dist/aster-manifest.json' with { type: 'json' };
import { streamResponse } from '@fierst/aster/ssr';

export default {
  fetch(req: Request) {
    const url = new URL(req.url);
    return streamResponse(<App url={url.pathname + url.search} />, {
      title: 'Streaming Aster',
      revive: true,
      manifest,
    });
  },
};
```

For a nonce-based Content Security Policy, pass the response's nonce as `nonce` in the document options and include the matching nonce in the response's `script-src` header. Aster applies it to its import map, module bootstrap, and deferred streaming swap scripts. The application supplies the policy header and generates a fresh nonce for each response.

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
