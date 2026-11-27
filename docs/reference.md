# Aster API reference

The package is ESM. Import browser APIs from `@fierst/aster`, server rendering from `@fierst/aster/ssr`, and build integrations in configuration files. The package requires Node 20.19 or later. Contributors use the Node version in `.node-version`.

## Components and DOM ownership

| Core export                                                                                 | When and how to use it                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ComponentFn<P>`, `View`                                                                    | A function receives props and `Ctx<P>`. Return a view, yield views from a synchronous generator, or yield from an async generator. Views include strings, numbers, booleans, null, undefined, nested arrays, templates and component views. Put asynchronous rendering in an async generator.      |
| `render(view, element)`                                                                     | Clears the container and mounts a client root. Keep the returned disposal function and call it when removing that root.                                                                                                                                                                            |
| `claim(Component, props, element)`                                                          | Attach a component to compatible server-rendered children inside the element. Supply the same initial props and markup. Keep SSR comment markers intact. A mismatch can remount the affected content.                                                                                              |
| `mountComponent(fn, props, parent, before, claimTarget?, onError?, key?, parentContext?)`   | Lower-level host integration. Insert before a sibling or pass null to append. A claim target is an element or a `ClaimRange` with parent and nullable start/end comment anchors. Both mount and claim return a `ComponentHandle` with fn, optional key, update(nextProps), and dispose().          |
| `signal(initial)`                                                                           | A `Signal<T>` is callable. Read during synchronous render to subscribe, use peek() to read without subscribing, set(value) to replace, or update(previous => next) to derive a replacement. Object.is-equal writes skip notification. Replace mutated collections to notify readers.               |
| `createContext(defaultValue)`, `provide(context, value)`, `useContext(context)`, `Provider` | Create one shared context identity. Supply its value inside a rendering ancestor or via Provider's context/value props. The nearest provider wins, siblings are isolated, and a missing provider yields the default. On hosts without Node async context storage, capture context before awaiting. |
| `ErrorBoundary`                                                                             | Wrap children with fallback(error, reset) and optional onError(error). Calling reset mounts fresh children. Return event-handler promises so their rejections reach the owning boundary.                                                                                                           |

A synchronous generator retains local variables between yields. Read incoming props inside `for (props of ctx)`. DOM handlers and child callback props named like events schedule an owner update. For external notifications, change state and call `ctx.refresh()`. Register timers, listeners and subscriptions for disposal with `ctx.onCleanup(fn)` or a generator finally block. Each execution has an AbortSignal at `ctx.signal`. Pass it into fetch. Read DOM after patching with `ctx.afterRender(fn)`, including from a ref callback. It runs once, and registering it alone does not trigger a render.

## JSX and tagged templates

| Syntax                                                             | Behavior                                                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Row key={row.id} {...row} />`                                    | Use a stable unique key per sibling to retain mounted state and DOM identity as a list reorders. A changed key starts a fresh instance.                                   |
| `onClick={fn}`, `on:my-event={fn}`                                 | Attach a DOM listener. The colon form preserves the event name. Call event.preventDefault() in handlers that take over native actions.                                    |
| `bind:value`                                                       | Text uses input, selects use change, and number/range inputs write Number(element.value). Bind a writable local/property, a signal, or a getter/setter pair.              |
| `bind:checked`, `bind:open`                                        | Checkboxes write a boolean on change. Details tracks toggle. Dialog opens modally, closes when false, and writes back on close.                                           |
| `class:active={flag}`, `style:color={color}`, `var:accent={color}` | Toggle one class, set one style property, or set a CSS custom property such as --accent. A style object supports camelCase keys and removes properties dropped on update. |
| `{...attrs}`, `ref={fn}`                                           | Later attributes override earlier ones. Dropping a spread key restores an earlier value when present. A ref receives the mounted or claimed element.                      |
| `disabled={flag}`, `aria-expanded={flag}`                          | False removes an ordinary boolean attribute. ARIA booleans remain the strings true and false.                                                                             |

Use the `html` tag in JavaScript modules for fixed markup with dynamic children or whole attribute values. Each template site caches its structure. For two-way binding in tagged HTML, pass a signal or an explicit getter/setter pair. For example, this browser module mounts and disposes a small form.

```js
import { html, render, signal } from '@fierst/aster';

const name = signal('');
const dispose = render(html`<input aria-label="Name" bind:value=${name} />`, document.body);
// When the host removes this form, call dispose().
```

The `@fierst/aster/jsx-runtime` and `@fierst/aster/jsx-dev-runtime` entries expose `jsx`, `jsxs`, `jsxDEV`, `Fragment`, the TypeScript `JSX` namespace and the three slot helpers. Automatic JSX uses cached runtime templates. Use the Vite plugin for binding transforms, source maps, HMR and island metadata.

### Compiler and adapter vocabulary

`_tpl(html, bindings)` creates a CompiledTemplate with indexed SlotBinding records for node, attr, or spread paths. `_slot(template, values, key?)` creates a SlotView branded by SLOT. `_comp(fn, props?, key?, src?)` creates a CompView branded by COMP. The client patches slots when values change. Table fragments and SVG descendants use their native parsing contexts. Framework adapters use `_runWithContext` to scope execution, `_decodeIslandValue` to restore encoded props, and `__asterHmrAccept` to replace mounted component code during development. Application components normally use JSX or tagged HTML.

## Custom elements and styles

`defineElement(tag, Component, options?)` registers and returns a CustomElementConstructor. In DefineElementOptions, props accepts a list of string attribute names or a map to PropType (string, number, boolean, json). Number uses Number(raw). A present boolean is true except for the literal "false". Removing it sets false. Other removed attributes and malformed JSON yield undefined. JS property assignment passes the value directly into props. On disconnect the element disposes its component, and on reconnect it mounts again.

The default mount is light DOM. Use shadow: true or 'open' for an open shadow root, or 'closed' for a closed one. The styles option accepts one constructed stylesheet or a list for the shadow root. The browser-only `css` tag creates a CSSStyleSheet. The `scope` tag returns a generated class name and installs its stylesheet when document.adoptedStyleSheets is available. Call it once at module scope. On the server it only generates the name. Supply a CSS file when the first server-rendered paint needs those styles.

## Router

`@fierst/aster/router` exports Router, navigate, matchRoute, useLocation, useParams, useSearchParams and the RouteDef and RouteMatch types. Declare routes in priority order. A RouteDef has path and component. A match contains route, decoded params, pathname and search (URLSearchParams). matchRoute(routes, url) returns the first match or null. Literal segments, :name and * work with both matchers. Wildcard captures use numeric names in the fallback.

Router passes {params, pathname, search} to the matched component. Its optional fallback receives {pathname} on a miss. Without a fallback the router renders empty content. Supply url for a controlled location, including the query string during SSR. Omit it in a client router that follows browser navigation. useLocation() reads the current URL, useParams<T>() reads the captures, and useSearchParams() parses the query.

Use ordinary links for navigation. Set transitions={false} on Router to disable its view transitions. navigate(to, {replace, transition}) uses browser navigation when available, otherwise History API and the supplied transition setting. With the History fallback Aster intercepts unmodified primary clicks on root-relative links, skips download, target and data-aster-reload links, and listens for popstate. Configure your host to serve direct route requests as well.

## Server output and activation

| Import from @fierst/aster/ssr                | Result                                                                                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| renderToString(view, opts?)                  | HTML fragment. Synchronous generators render their first step. Async generators produce empty content in this mode.                                                                                   |
| renderToStringAsync(view, opts?)             | Promise of a fragment. Consumes finite async generators and renders their final view.                                                                                                                 |
| renderDocument(view, opts?)                  | Synchronous complete HTML document.                                                                                                                                                                   |
| htmlResponse(view, opts?, status = 200)      | Fetch Response wrapping that document with an HTML content type. Pass 404 explicitly for HTTP-level misses.                                                                                           |
| renderToStream(view, opts?)                  | ReadableStream of UTF-8 document bytes. Yield loading content before the first slow await. Each async boundary sends its final replacement when it finishes. Canceling the stream aborts active work. |
| streamResponse(view, opts?, status = 200)    | Fetch Response backed by the document stream.                                                                                                                                                         |
| resolveIslandSrc(src, manifest?, base = '/') | Resolve a source path through a RevivalManifest, preserving its #export. Accepts a filename or {file} entry. Relative targets use base. Missing entries keep the original URL.                        |

Fragment SSROptions are revive (opt in), manifest and base. DocumentOptions supports those and defaults revive to true, lang to 'en', and title to 'Aster'. Set head to trusted HTML, importmap to a specifier-to-URL map, nonce to the response's CSP nonce, and revivalUrl/runtimeUrl to override browser entry URLs. A fragment with revival markers needs a host-installed loader. For a static document use {revive: false}. Streaming swaps still use scripts to display deferred content.

Island props support null, undefined, strings, booleans, finite numbers, arrays, plain objects, valid dates, URLSearchParams, templates, client component views and exported client callbacks. These values and module references are visible to the browser. For a captured callback, export the owning component so the browser can recreate the closure. The encoder reports a path when a value is cyclic, a server-only closure, or an unsupported instance.

`installRevival(runtimeUrl?)` from `@fierst/aster/revive` installs delegated listeners in the browser and returns a function to abort those listeners. Install once per document. Pointer entry and focus preload a module. Keydown, click, input, change and submit activate the closest dormant island, claim its DOM, then replay the interaction. To activate at startup, mark the island wrapper itself with data-aster-eager. Removed activated islands are disposed. A failed import/claim dispatches a bubbling aster:revival-error with the error in event.detail. A later interaction can retry.

## Vite configuration and production builds

`@fierst/aster/vite` exports default and named aster(options?) plus AsterPluginOptions and FilterPattern. Include defaults to ['.tsx', '.jsx'], exclude to [], runtimeImport to '@fierst/aster', manifestFile to 'aster-manifest.json'. Use the option names `include`, `exclude`, `runtimeImport`, and `manifestFile`. Each filter accepts strings or regular expressions in an array. A leading dot denotes an extension suffix, wildcard patterns match paths, and other strings match substrings. Excludes take precedence.

The pre-transform parses with Oxc, emits hoisted templates and source mappings, then lets Vite strip TypeScript. Client builds preserve reached client exports and emit the manifest, runtime and revival entry chunks. Include every island module in the client build graph. Deploy the client assets at the configured Vite base and give the server the manifest from that same build. An SSR-only build does not produce the client manifest.

## Diagnosing an application

| Symptom                                                  | Check                                                                                                                                                                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counter changes in a click but stays stale after a timer | Schedule ctx.refresh() after changing a local, or read a signal during render and update that signal.                                                                                                             |
| Async child keeps reloading                              | Compare its props by identity. Move stable loader callbacks outside the parent render loop.                                                                                                                       |
| Input moves to a different list item                     | Key rows by stable record IDs. Keep server and first client output compatible and preserve SSR markers.                                                                                                           |
| Server content is missing or a streaming response stalls | Choose an async renderer and make the generator finite. Yield the loading view before slow work.                                                                                                                  |
| First interaction does nothing in production             | Inspect data-aster-src, its export name, the two loader URLs, and the network response for each module. Check aster:revival-error and the deployment base.                                                        |
| A lesson runs locally but fails in the learning editor   | The editor accepts JavaScript/JSX, a component named App or a default export, and supported named imports from the core package. Use a scaffolded project for TypeScript, router, Astro, and third-party imports. |
