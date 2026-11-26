// Aster Astro Server Renderer (`@fierst/aster/astro/server`)
// Implements Astro's NamedSSRLoadedRendererValue interface with zero runtime dependency on `astro`.

import { COMP, SLOT, _comp } from '../runtime.ts';
import { renderToStringAsync } from '../ssr.ts';
import { mergeAstroProps } from './slots.ts';

export interface AstroComponentMetadata {
  displayName?: string;
  hydrate?: 'load' | 'idle' | 'visible' | 'media' | 'only' | string;
  hydrateArgs?: unknown;
  componentUrl?: string;
  componentExport?: { value: string; namespace?: boolean };
  astroStaticSlot?: boolean;
}

export interface AstroServerRenderResult {
  html: string;
  attrs?: Record<string, string>;
}

export interface AstroServerRenderer {
  name: string;
  supportsAstroStaticSlot: boolean;
  check(
    Component: unknown,
    props?: Record<string, any>,
    slots?: Record<string, string>,
    metadata?: AstroComponentMetadata,
  ): Promise<boolean>;
  renderToStaticMarkup(
    Component: any,
    props?: Record<string, any>,
    slots?: Record<string, string>,
    metadata?: AstroComponentMetadata,
  ): Promise<AstroServerRenderResult>;
}

function isAsterView(val: unknown): boolean {
  if (val == null || typeof val !== 'object') return false;
  if (Array.isArray(val)) return val.some((item) => isAsterView(item));
  return SLOT in val || COMP in val;
}

/**
 * Determine whether `Component` belongs to Aster.
 * Designed to coexist cleanly in multi-framework Astro projects (React, Vue, Svelte, Solid, Preact).
 */
export async function check(
  Component: unknown,
  props: Record<string, any> = {},
  slots: Record<string, string> = {},
  _metadata?: AstroComponentMetadata,
): Promise<boolean> {
  if (typeof Component !== 'function') return false;
  const fn = Component as any;

  // Never hijack React class/memo/forwardRef components
  if (fn.prototype?.isReactComponent || fn.$$typeof) return false;

  // Fast path 1: Stamped by `@fierst/aster/vite`
  if (typeof fn.__asterSrc === 'string' || typeof fn.__asterHmrId === 'string') return true;

  // Fast path 2: Native JavaScript Generator / AsyncGenerator components
  const ctorName = fn.constructor?.name;
  if (ctorName === 'GeneratorFunction' || ctorName === 'AsyncGeneratorFunction') return true;

  // Fallback for unstamped stateless `function` components: dry-check return value
  const ac = new AbortController();
  const dryCtx = {
    signal: ac.signal,
    refresh() {},
    onCleanup() {},
    [Symbol.iterator]() {
      let used = false;
      return {
        next() {
          if (used) return { done: true, value: undefined };
          used = true;
          return { done: false, value: props };
        },
      };
    },
  };

  try {
    const merged = mergeAstroProps(props, slots, true);
    const out = fn(merged, dryCtx);
    if (out && typeof out === 'object') {
      if (typeof out[Symbol.asyncIterator] === 'function') {
        ac.abort();
        await out.return?.();
        return true;
      }
      if (typeof out.next === 'function') {
        ac.abort();
        out.return?.();
        return true;
      }
      return isAsterView(out);
    }
    return false;
  } catch {
    return false;
  } finally {
    ac.abort();
  }
}

/**
 * Server-render an Aster component inside Astro (supports `function`, `function*`, and `async function*`).
 * When `metadata?.hydrate` is present (`client:load`, `client:idle`, `client:visible`, `client:media`),
 * emits range anchors (`<!--aster-s:N-->...<!--aster:N-->`) without a duplicate `<aster-island>` wrapper so
 * `@fierst/aster/astro/client` can claim Astro's `<astro-island>` DOM in-place with zero flicker.
 */
export async function renderToStaticMarkup(
  Component: any,
  props: Record<string, any> = {},
  slots: Record<string, string> = {},
  metadata?: AstroComponentMetadata,
): Promise<AstroServerRenderResult> {
  const willHydrate = Boolean(metadata?.hydrate && metadata.hydrate !== 'only');
  const staticSlot = metadata?.astroStaticSlot ?? true;
  const merged = mergeAstroProps(props, slots, staticSlot);

  const html = await renderToStringAsync(_comp(Component, merged), {
    revive: willHydrate,
    _inIsland: willHydrate,
  });

  return {
    html,
    attrs: willHydrate ? { 'data-aster-astro': '1' } : undefined,
  };
}

const serverRenderer: AstroServerRenderer = {
  name: 'aster',
  supportsAstroStaticSlot: true,
  check,
  renderToStaticMarkup,
};

export default serverRenderer;
