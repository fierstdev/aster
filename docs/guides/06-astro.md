# Using Aster in an Astro project

Install `@fierst/aster` in the Astro app and register its integration in `astro.config.mjs`. The integration installs the Aster Vite transform and registers the server and browser renderers.

```js
import { defineConfig } from 'astro/config';
import aster from '@fierst/aster/astro';

export default defineConfig({
  integrations: [aster({ include: ['**/*.aster.tsx'] })],
});
```

Here the suffix identifies files that Aster owns in a mixed-framework project. Configure other JSX integrations to exclude those files. With the default configuration, Aster processes all JSX and TSX. The integration accepts include, exclude and runtimeImport. Set jsxImportSource to @fierst/aster for Aster TSX types, or use a file-level JSX import source pragma in a mixed project.

Create `src/components/Panel.aster.tsx`.

```tsx
/** @jsxImportSource @fierst/aster */
import type { Ctx, View } from '@fierst/aster';

type Props = { caption?: View; children?: View };

export function* Panel(props: Props, ctx: Ctx<Props>) {
  let count = 0;
  for (props of ctx) {
    yield (
      <section>
        <h2>{props.caption}</h2>
        {props.children}
        <button onClick={() => count++}>Clicks: {count}</button>
      </section>
    );
  }
}
```

Render it in `src/pages/index.astro`.

```astro
---
import { Panel } from '../components/Panel.aster';
---
<Panel client:visible>
  <span slot="caption">Cart</span>
  <p>Items in this order</p>
</Panel>
```

The default slot becomes props.children and each named slot becomes the prop of the same name. Astro supplies rendered slot HTML. Render those props as views. With client:visible, the server sends the section and Astro activates it when visible. Use client:load for immediate activation, client:idle for idle time, or client:media="(min-width: 50em)" for a media query. Omit the directive for static HTML. Use client:only="aster" to mount entirely in the browser.

Astro owns the activation schedule. Its island contains Aster's claim markers. The client renderer attaches to the existing children, preserves compatible input state and disposes on astro:unmount during client navigation. The standalone installRevival bootstrap belongs to Aster-rendered documents.

## Adapter entry points

The default integration is also exported as asterAstro. Its types are AsterAstroOptions, AstroIntegration, AstroRendererConfig and AstroSetupContext. The default export of `@fierst/aster/astro/server` exposes check and renderToStaticMarkup, also available as named exports. The former selects Aster components. The latter receives Component, props, slots and optional AstroComponentMetadata and asynchronously returns AstroServerRenderResult with html and optional attrs. AstroServerRenderer describes that contract.

The default export of `@fierst/aster/astro/client` accepts the island element and returns an async function accepting Component, props, slots and AstroClientOptions (client directive). It claims existing HTML or mounts fresh content for an empty or client-only island. Astro invokes these adapter functions for you.
