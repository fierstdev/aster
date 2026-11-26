// Aster Universal SSR — Sync, Async, & Out-of-Order Streaming SSR
// Features:
//   - Single-pass generator rendering with guaranteed `finally` cleanup
//   - Full attribute merging for `class:*`, `style:*`, `var:*`, `style` objects, & `{...spread}`
//   - Range anchor preservation (`<!--aster-s:N-->...<!--aster:N-->`) inside revived islands for exact `claim()`
//   - Per-request tree-scoped Context isolation (zero cross-request leakage in edge isolates)
//   - `renderToStringAsync()` & `renderToStream()` (`ReadableStream`) for `async function*` components

import {
  SLOT,
  COMP,
  _runWithContext,
  _setAsyncContextStorage,
  isAttributeName,
  type SlotView,
  type View,
} from './runtime.ts';

function escapeHtml(str: unknown): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toKebab(prop: string): string {
  return prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

function parseStyleString(cssText: string, styles: Map<string, string>) {
  for (const decl of cssText.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const k = decl.slice(0, idx).trim();
    const v = decl.slice(idx + 1).trim();
    if (k && v) styles.set(k, v);
  }
}

function applyAttrEntry(
  name: string,
  val: unknown,
  classes: Set<string>,
  styles: Map<string, string>,
  extraAttrs: string[],
) {
  if (!isAttributeName(name) || /^on/i.test(name)) return;
  if (name === 'key' || name === 'ref' || name === 'children') return;

  if (name === 'class' || name === 'className') {
    if (typeof val === 'string') {
      for (const token of val.split(/\s+/)) {
        if (token) classes.add(token);
      }
    }
    return;
  }

  if (name.startsWith('class:')) {
    const cls = name.slice(6);
    if (val) classes.add(cls);
    else classes.delete(cls);
    return;
  }

  if (name.startsWith('style:')) {
    const prop = toKebab(name.slice(6));
    if (val != null && val !== '') styles.set(prop, String(val));
    else styles.delete(prop);
    return;
  }

  if (name.startsWith('var:')) {
    const prop = '--' + name.slice(4);
    if (val != null && val !== '') styles.set(prop, String(val));
    else styles.delete(prop);
    return;
  }

  if (name === 'style') {
    if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const prop = toKebab(k);
        if (v != null && v !== '') styles.set(prop, String(v));
        else styles.delete(prop);
      }
    } else if (typeof val === 'string') {
      parseStyleString(val, styles);
    }
    return;
  }

  if (name === 'bind:value') {
    const cur = Array.isArray(val) ? val[0]() : typeof val === 'function' ? val() : val;
    if (cur != null && cur !== '') extraAttrs.push(`value="${escapeHtml(cur)}"`);
    return;
  }

  if (name === 'bind:checked') {
    const cur = Array.isArray(val) ? val[0]() : typeof val === 'function' ? val() : val;
    if (cur) extraAttrs.push('checked');
    return;
  }

  if (name === 'bind:open') {
    const cur = Array.isArray(val) ? val[0]() : typeof val === 'function' ? val() : val;
    if (cur) extraAttrs.push('open');
    return;
  }

  if (name.startsWith('aria-') && typeof val === 'boolean') {
    extraAttrs.push(`${name}="${String(val)}"`);
    return;
  }

  if (val === true) {
    extraAttrs.push(name);
  } else if (val !== false && val != null) {
    extraAttrs.push(`${name}="${escapeHtml(val)}"`);
  }
}

function hydrateTemplateAttrs(
  htmlStr: string,
  bindings: readonly { kind: 'attr' | 'spread' | 'node'; name?: string }[],
  values: readonly any[],
): string {
  if (!htmlStr.includes('data-aster-a')) return htmlStr;

  return htmlStr.replace(
    /<([a-zA-Z][\w:-]*)((?:\s+(?:[^>"']|"[^"]*"|'[^']*')*?)?)\s*(\/?)>/g,
    (fullMatch, tag: string, rawAttrs: string, selfClose: string) => {
      if (!rawAttrs || !rawAttrs.includes('data-aster-a')) return fullMatch;

      const classes = new Set<string>();
      const styles = new Map<string, string>();
      const extraAttrs: string[] = [];
      const markerIndices: number[] = [];

      // Collect dynamic marker indices in order and strip them from static attrs
      let cleaned = rawAttrs.replace(/\s*data-aster-a(\d+)=""/g, (_m, idxStr) => {
        markerIndices.push(Number(idxStr));
        return '';
      });

      // Extract static class="..." so we can merge cleanly with class:* and dynamic class
      cleaned = cleaned.replace(/\s+class="([^"]*)"/g, (_m, clsStr: string) => {
        for (const token of clsStr.split(/\s+/)) {
          if (token) classes.add(token);
        }
        return '';
      });

      // Extract static style="..." so we can merge cleanly with style:*, var:*, and style objects
      cleaned = cleaned.replace(/\s+style="([^"]*)"/g, (_m, styleStr: string) => {
        parseStyleString(styleStr, styles);
        return '';
      });

      for (const idx of markerIndices) {
        const b = bindings[idx];
        const val = values[idx];
        if (!b) continue;
        if (b.kind === 'spread') {
          if (val && typeof val === 'object') {
            for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
              applyAttrEntry(k, v, classes, styles, extraAttrs);
            }
          }
        } else if (b.kind === 'attr' && b.name) {
          applyAttrEntry(b.name, val, classes, styles, extraAttrs);
        }
      }

      const parts: string[] = [];
      const staticRest = cleaned.trim();
      if (staticRest) parts.push(staticRest);
      if (classes.size > 0) parts.push(`class="${escapeHtml([...classes].join(' '))}"`);
      if (styles.size > 0) {
        const cssText = [...styles.entries()].map(([k, v]) => `${k}:${v}`).join(';');
        parts.push(`style="${escapeHtml(cssText)}"`);
      }
      for (const attr of extraAttrs) parts.push(attr);

      return `<${tag}${parts.length > 0 ? ' ' + parts.join(' ') : ''}${selfClose}>`;
    },
  );
}

import { routeContext } from './route-context.ts';

function serializeProps(
  props: Record<string, unknown> | undefined,
  context: Record<symbol, unknown>,
): string {
  const route = context[routeContext.id];
  let attrs = route ? ` data-aster-route="${escapeHtml(JSON.stringify(route))}"` : '';
  const queries: string[] = [];
  const clean: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v instanceof URLSearchParams) {
      queries.push(k);
      clean[k] = v.toString();
    } else if (
      typeof v !== 'function' &&
      v !== undefined &&
      (k !== 'children' ||
        v === null ||
        typeof v !== 'object' ||
        (Array.isArray(v) && v.every((item) => item == null || typeof item !== 'object')))
    ) {
      clean[k] = v;
    }
  }
  if (queries.length) attrs += ` data-aster-query-props="${escapeHtml(JSON.stringify(queries))}"`;
  return (
    attrs +
    (Object.keys(clean).length > 0
      ? ` data-aster-props="${escapeHtml(JSON.stringify(clean))}"`
      : '')
  );
}

/**
 * Supports both Aster's `aster-manifest.json` (`{ "/src/Counter.tsx": "/assets/Counter-HASH.js" }`)
 * and standard Vite/Rolldown `.vite/manifest.json` (`{ "src/Counter.tsx": { file: "assets/Counter-HASH.js" } }`).
 */
export type RevivalManifest = Record<string, string | { file: string }>;

export function resolveIslandSrc(src: string, manifest?: RevivalManifest, base = '/'): string {
  if (!manifest) return src;
  const hashIdx = src.indexOf('#');
  const rawUrl = hashIdx === -1 ? src : src.slice(0, hashIdx);
  const exportSuffix = hashIdx === -1 ? '' : src.slice(hashIdx);

  const normalizedLeading = rawUrl.startsWith('/') ? rawUrl : '/' + rawUrl;
  const normalizedBare = normalizedLeading.slice(1);
  const entry = manifest[rawUrl] ?? manifest[normalizedLeading] ?? manifest[normalizedBare];
  if (!entry) return src;

  const targetFile = typeof entry === 'string' ? entry : entry.file;
  const cleanBase = base.endsWith('/') ? base : base + '/';
  const resolvedUrl =
    targetFile.startsWith('/') || /^https?:\/\//.test(targetFile)
      ? targetFile
      : `${cleanBase}${targetFile.replace(/^\/+/, '')}`;
  return `${resolvedUrl}${exportSuffix}`;
}

export interface SSROptions {
  /** Automatically emit `<aster-island>` wrappers & range anchors for exported generator components */
  revive?: boolean;
  /** Optional production manifest (`aster-manifest.json` or Vite `.vite/manifest.json`) */
  manifest?: RevivalManifest;
  /** Public base URL prefix when resolving relative manifest entries (default: '/') */
  base?: string;
  /** @internal suppresses nested `<aster-island>` wrappers inside an already-marked island */
  _inIsland?: boolean;
  /** @internal per-request tree-scoped Context prototype chain */
  _ctxMap?: Record<symbol, any> | null;
  /** @internal shared with nested renders after a streaming boundary resolves */
  _signal?: AbortSignal;
}

function makeSsrCtx(props: any, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const cleanups = new Set<() => void>();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    abort,
    refresh() {},
    onCleanup(callback: () => void) {
      cleanups.add(callback);
    },
    dispose() {
      parentSignal?.removeEventListener('abort', abort);
      abort();
      const errors: unknown[] = [];
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      cleanups.clear();
      if (errors.length) throw new AggregateError(errors, 'SSR component cleanup failed');
    },
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
}

function wrapSlotNode(idx: number, rendered: string, opts: SSROptions): string {
  // Inside a revived island, bracket dynamic node slots with `<!--aster-s:i-->...<!--aster:i-->`
  // so `claim()` preserves exact structural paths and adopts Text/Slot/Comp nodes in-place.
  if (opts.revive && opts._inIsland) {
    return `<!--aster-s:${idx}-->${rendered}<!--aster:${idx}-->`;
  }
  return rendered;
}

function templateParts<T extends string | Promise<string>>(
  view: SlotView,
  renderNode: (index: number) => T,
): (string | T)[] {
  const tpl = view[SLOT];
  const markup = hydrateTemplateAttrs(tpl.html, tpl.bindings, view.v);
  const parts: (string | T)[] = [];
  let offset = 0;
  for (const match of markup.matchAll(/<!--aster:(\d+)-->/g)) {
    const index = Number(match[1]);
    if (tpl.bindings[index]?.kind !== 'node') continue;
    parts.push(markup.slice(offset, match.index), renderNode(index));
    offset = match.index + match[0].length;
  }
  parts.push(markup.slice(offset));
  return parts;
}

// =============================================================================
// 1. Synchronous SSR (`renderToString`)
// =============================================================================
export function renderToString(view: View, opts: SSROptions = {}): string {
  if (view == null || view === false || view === true) return '';
  if (Array.isArray(view))
    return view.map((item, i) => wrapSlotNode(i, renderToString(item, opts), opts)).join('');
  if (typeof view !== 'object') return escapeHtml(view);

  if (COMP in view) {
    const isIslandBoundary = Boolean(opts.revive && !opts._inIsland && view.src);
    const localCtx: Record<symbol, any> = Object.create(opts._ctxMap ?? null);
    const childOpts: SSROptions = {
      ...opts,
      _inIsland: isIslandBoundary ? true : opts._inIsland,
      _ctxMap: localCtx,
    };

    const ctx = makeSsrCtx(view.p);

    let innerHtml = '';
    try {
      const res = _runWithContext(localCtx, () => view[COMP](view.p, ctx));
      if (res && typeof res[Symbol.asyncIterator] === 'function') {
        // Sync SSR cannot await async generators; clean up immediately
        ctx.abort();
        res.return?.();
        innerHtml = '';
      } else if (res && typeof res.next === 'function') {
        try {
          const out = _runWithContext(localCtx, () => res.next(view.p));
          innerHtml = renderToString(out.value, childOpts);
        } finally {
          ctx.abort();
          if (typeof res.return === 'function') res.return();
        }
      } else {
        innerHtml = renderToString(res, childOpts);
      }
    } catch (err) {
      if (typeof view.p?.fallback === 'function') {
        innerHtml = renderToString(
          _runWithContext(localCtx, () => view.p.fallback(err, () => {})),
          childOpts,
        );
      } else {
        throw err;
      }
    } finally {
      ctx.dispose();
    }

    if (isIslandBoundary) {
      const resolvedSrc = resolveIslandSrc(view.src!, opts.manifest, opts.base);
      return `<aster-island data-aster-src="${escapeHtml(resolvedSrc)}"${serializeProps(view.p, localCtx)}>${innerHtml}</aster-island>`;
    }
    return innerHtml;
  }

  if (SLOT in view) {
    return templateParts(view, (i) => wrapSlotNode(i, renderToString(view.v[i], opts), opts)).join(
      '',
    );
  }

  return '';
}

// =============================================================================
// 2. Async SSR (`renderToStringAsync`) — Awaits `async function*` Components
// =============================================================================
let alsReady = false;
let alsInitPromise: Promise<void> | null = null;

function ensureAsyncContextStorage(): Promise<void> {
  if (!alsInitPromise) {
    alsInitPromise = (async () => {
      try {
        const modId = 'node:async_hooks';
        const { AsyncLocalStorage } = (await import(/* @vite-ignore */ modId)) as {
          AsyncLocalStorage: new () => {
            getStore(): Record<symbol, any> | null | undefined;
            run<R>(store: Record<symbol, any> | null, fn: () => R): R;
          };
        };
        _setAsyncContextStorage(new AsyncLocalStorage());
      } catch {
        // Non-Node environments fall back to synchronous context scoping
      } finally {
        alsReady = true;
      }
    })();
  }
  return alsInitPromise;
}

export async function renderToStringAsync(view: View, opts: SSROptions = {}): Promise<string> {
  if (!alsReady) await ensureAsyncContextStorage();
  opts._signal?.throwIfAborted();
  if (view == null || view === false || view === true) return '';
  if (Array.isArray(view)) {
    const parts = await Promise.all(view.map((item) => renderToStringAsync(item, opts)));
    return parts.map((part, i) => wrapSlotNode(i, part, opts)).join('');
  }
  if (typeof view !== 'object') return escapeHtml(view);

  if (COMP in view) {
    const isIslandBoundary = Boolean(opts.revive && !opts._inIsland && view.src);
    const localCtx: Record<symbol, any> = Object.create(opts._ctxMap ?? null);
    const childOpts: SSROptions = {
      ...opts,
      _inIsland: isIslandBoundary ? true : opts._inIsland,
      _ctxMap: localCtx,
    };

    const ctx = makeSsrCtx(view.p, opts._signal);

    let innerHtml = '';
    try {
      const res = _runWithContext(localCtx, () => view[COMP](view.p, ctx));
      if (res && typeof res[Symbol.asyncIterator] === 'function') {
        let lastView: View = null;
        try {
          while (true) {
            ctx.signal.throwIfAborted();
            const out = await _runWithContext(localCtx, () => res.next(view.p));
            if (!out.done || out.value !== undefined) lastView = out.value;
            if (out.done) break;
          }
          innerHtml = await renderToStringAsync(lastView, childOpts);
        } finally {
          ctx.abort();
          if (typeof res.return === 'function') await res.return();
        }
      } else if (res && typeof res.next === 'function') {
        try {
          const out = _runWithContext(localCtx, () => res.next(view.p));
          innerHtml = await renderToStringAsync(out.value, childOpts);
        } finally {
          ctx.abort();
          if (typeof res.return === 'function') res.return();
        }
      } else {
        innerHtml = await renderToStringAsync(res, childOpts);
      }
    } catch (err) {
      if (typeof view.p?.fallback === 'function') {
        innerHtml = await renderToStringAsync(
          _runWithContext(localCtx, () => view.p.fallback(err, () => {})),
          childOpts,
        );
      } else {
        throw err;
      }
    } finally {
      ctx.dispose();
    }

    if (isIslandBoundary) {
      const resolvedSrc = resolveIslandSrc(view.src!, opts.manifest, opts.base);
      return `<aster-island data-aster-src="${escapeHtml(resolvedSrc)}"${serializeProps(view.p, localCtx)}>${innerHtml}</aster-island>`;
    }
    return innerHtml;
  }

  if (SLOT in view) {
    const parts = templateParts(view, async (i) =>
      wrapSlotNode(i, await renderToStringAsync(view.v[i], opts), opts),
    );
    return (await Promise.all(parts)).join('');
  }

  return '';
}

// =============================================================================
// 3. Document Helpers & Out-of-Order Streaming SSR (`renderToStream`)
// =============================================================================
export interface DocumentOptions {
  title?: string;
  lang?: string;
  head?: string;
  importmap?: Record<string, string>;
  /** Browser module exporting installRevival. Overrides the production manifest. */
  revivalUrl?: string;
  runtimeUrl?: string;
  revive?: boolean;
  manifest?: RevivalManifest;
  base?: string;
}

function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildDocOpen(opts: DocumentOptions): string {
  const title = escapeHtml(opts.title ?? 'Aster');
  const lang = escapeHtml(opts.lang ?? 'en');
  const importmapTag = opts.importmap
    ? `<script type="importmap">${inlineJson({ imports: opts.importmap })}</script>`
    : '';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title>${importmapTag}${opts.head ?? ''}</head><body><div id="app">`;
}

function buildReviveScript(opts: DocumentOptions): string {
  if (!(opts.revive ?? true)) return '';
  const loader =
    opts.revivalUrl ?? resolveIslandSrc('@fierst/aster/revive', opts.manifest, opts.base);
  const runtime = opts.runtimeUrl ?? resolveIslandSrc('@fierst/aster', opts.manifest, opts.base);
  return `<script type="module">import{installRevival}from${inlineJson(loader)};installRevival(${inlineJson(runtime)});</script>`;
}

/** Render an Aster view into a complete HTML5 document with automatic Lazy Revival. */
export function renderDocument(view: View, opts: DocumentOptions = {}): string {
  const revive = opts.revive ?? true;
  const body = renderToString(view, { revive, manifest: opts.manifest, base: opts.base });
  return `${buildDocOpen(opts)}${body}</div>${buildReviveScript(opts)}</body></html>`;
}

/** Return a Web-Standard HTML Response (works in Cloudflare workerd or any Fetch-based server). */
export function htmlResponse(view: View, opts: DocumentOptions = {}, status = 200): Response {
  return new Response(renderDocument(view, opts), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

interface StreamTracker {
  signal: AbortSignal;
  nextId(): number;
  register(task: Promise<void>): void;
  emit(chunk: string): void;
}

function buildSwapChunk(id: number, finalHtml: string): string {
  return (
    `<template id="aster-t-${id}">${finalHtml}</template>` +
    `<script>(function(){var b=document.getElementById("aster-b-${id}"),t=document.getElementById("aster-t-${id}");` +
    `if(b&&t){b.replaceWith(t.content);t.remove();}var s=document.currentScript;if(s)s.remove();})()</script>`
  );
}

async function renderStreamNode(
  view: View,
  opts: SSROptions,
  tracker: StreamTracker,
): Promise<string> {
  if (!alsReady) await ensureAsyncContextStorage();
  tracker.signal.throwIfAborted();
  if (view == null || view === false || view === true) return '';
  if (Array.isArray(view)) {
    const parts = await Promise.all(view.map((item) => renderStreamNode(item, opts, tracker)));
    return parts.map((part, i) => wrapSlotNode(i, part, opts)).join('');
  }
  if (typeof view !== 'object') return escapeHtml(view);

  if (COMP in view) {
    const isIslandBoundary = Boolean(opts.revive && !opts._inIsland && view.src);
    const localCtx: Record<symbol, any> = Object.create(opts._ctxMap ?? null);
    const childOpts: SSROptions = {
      ...opts,
      _inIsland: isIslandBoundary ? true : opts._inIsland,
      _ctxMap: localCtx,
    };

    const ctx = makeSsrCtx(view.p, tracker.signal);
    let deferredCleanup = false;
    let iterator: AsyncGenerator | undefined;

    let innerHtml = '';
    try {
      const res = _runWithContext(localCtx, () => view[COMP](view.p, ctx));
      if (res && typeof res[Symbol.asyncIterator] === 'function') {
        // Pull the first yielded view immediately (loading skeleton) for fast TTFB
        iterator = res;
        const first = await _runWithContext(localCtx, () => res.next(view.p));
        if (first.done) {
          innerHtml = await renderStreamNode(first.value, childOpts, tracker);
        } else {
          const id = tracker.nextId();
          const fallbackHtml = await renderStreamNode(first.value, childOpts, tracker);
          innerHtml = `<aster-b id="aster-b-${id}">${fallbackHtml}</aster-b>`;

          // Pump the remaining async yields out-of-order and stream swap script on completion
          deferredCleanup = true;
          const task = (async () => {
            let lastView: View = first.value;
            try {
              while (!ctx.signal.aborted) {
                const step = await _runWithContext(localCtx, () => res.next(view.p));
                if (!step.done || step.value !== undefined) lastView = step.value;
                if (step.done) break;
              }
              if (ctx.signal.aborted) return;
              const resolvedHtml = await renderToStringAsync(lastView, childOpts);
              tracker.emit(buildSwapChunk(id, resolvedHtml));
            } catch (err) {
              if (typeof view.p?.fallback === 'function') {
                const errHtml = await renderToStringAsync(
                  _runWithContext(localCtx, () => view.p.fallback(err, () => {})),
                  childOpts,
                );
                tracker.emit(buildSwapChunk(id, errHtml));
              } else if (!ctx.signal.aborted) {
                throw err;
              }
            } finally {
              ctx.abort();
              try {
                await res.return?.();
              } finally {
                ctx.dispose();
              }
            }
          })();
          tracker.register(task);
        }
      } else if (res && typeof res.next === 'function') {
        try {
          const out = _runWithContext(localCtx, () => res.next(view.p));
          innerHtml = await renderStreamNode(out.value, childOpts, tracker);
        } finally {
          ctx.abort();
          if (typeof res.return === 'function') res.return();
        }
      } else {
        innerHtml = await renderStreamNode(res, childOpts, tracker);
      }
    } catch (err) {
      if (typeof view.p?.fallback === 'function') {
        innerHtml = await renderStreamNode(
          _runWithContext(localCtx, () => view.p.fallback(err, () => {})),
          childOpts,
          tracker,
        );
      } else {
        throw err;
      }
    } finally {
      if (!deferredCleanup) {
        ctx.abort();
        try {
          await iterator?.return(undefined);
        } finally {
          ctx.dispose();
        }
      }
    }

    if (isIslandBoundary) {
      const resolvedSrc = resolveIslandSrc(view.src!, opts.manifest, opts.base);
      return `<aster-island data-aster-src="${escapeHtml(resolvedSrc)}"${serializeProps(view.p, localCtx)}>${innerHtml}</aster-island>`;
    }
    return innerHtml;
  }

  if (SLOT in view) {
    const parts = templateParts(view, async (i) =>
      wrapSlotNode(i, await renderStreamNode(view.v[i], opts, tracker), opts),
    );
    return (await Promise.all(parts)).join('');
  }

  return '';
}

/**
 * Out-of-order streaming HTML5 SSR (`ReadableStream<Uint8Array>`).
 * Sends the initial document shell + loading states of `async function*` components immediately,
 * then streams lightweight self-cleaning `<template>` + `<script>` swap chunks as each resolves.
 */
export function renderToStream(view: View, opts: DocumentOptions = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const revive = opts.revive ?? true;

  const lifetime = new AbortController();
  return new ReadableStream<Uint8Array>({
    cancel() {
      lifetime.abort();
    },
    async start(controller) {
      let seq = 0;
      const pending: Promise<void>[] = [];
      let shellSent = false;
      const earlyChunks: string[] = [];

      const tracker: StreamTracker = {
        signal: lifetime.signal,
        nextId: () => ++seq,
        register: (task) => {
          void task.catch(() => {}); // Observed by Promise.all after shell emission.
          pending.push(task);
        },
        emit: (chunk) => {
          if (lifetime.signal.aborted) return;
          if (shellSent) controller.enqueue(encoder.encode(chunk));
          else earlyChunks.push(chunk);
        },
      };

      try {
        const body = await renderStreamNode(
          view,
          { revive, manifest: opts.manifest, base: opts.base, _signal: lifetime.signal },
          tracker,
        );
        if (lifetime.signal.aborted) return;
        controller.enqueue(
          encoder.encode(`${buildDocOpen(opts)}${body}</div>${buildReviveScript(opts)}`),
        );

        shellSent = true;
        for (const chunk of earlyChunks) tracker.emit(chunk);
        earlyChunks.length = 0;

        // Drain all pending async boundaries (handles nested async boundaries too)
        while (pending.length > 0) {
          const batch = pending.splice(0, pending.length);
          await Promise.all(batch);
        }

        if (lifetime.signal.aborted) return;
        controller.enqueue(encoder.encode('</body></html>'));
        controller.close();
      } catch (err) {
        if (!lifetime.signal.aborted) controller.error(err);
        lifetime.abort();
      }
    },
  });
}

/** Return a Web-Standard streaming HTML Response for Cloudflare `workerd` or any Fetch server. */
export function streamResponse(view: View, opts: DocumentOptions = {}, status = 200): Response {
  return new Response(renderToStream(view, opts), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
