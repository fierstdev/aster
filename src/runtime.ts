// Aster Core Runtime — Generator Components (function* / async function*) + Slot-Compiled Templates
// Zero VDOM, zero () on local state, native yield* UI flows, automatic parent callback refresh,
// keyed .map() reconciliation, minimal signal(), tree-scoped Context, ErrorBoundary, HMR hot-swap,
// context-aware table/SVG templates, in-place SSR claim(), and unified Web Components.

import { routeContext } from './route-context.ts';
export const SLOT: unique symbol = Symbol.for('aster.slot') as any;
export const COMP: unique symbol = Symbol.for('aster.comp') as any;

// Statically folded to `false` by Vite+ / Rolldown in production builds,
// while safely short-circuiting to `false` in zero-build browser ESM.
const __DEV__: boolean =
  typeof import.meta !== 'undefined' &&
  !!(import.meta as { env?: { DEV?: boolean } }).env &&
  (import.meta as { env?: { DEV?: boolean } }).env!.DEV === true;

export interface Signal<T> {
  (): T;
  peek(): T;
  set(next: T): void;
  update(fn: (prev: T) => T): void;
}

export interface Ctx<P = any> extends Iterable<P> {
  readonly signal: AbortSignal;
  refresh(): void;
  onCleanup(cb: () => void): void;
}

export interface Context<T> {
  readonly id: symbol;
  readonly defaultValue: T;
}

export type SlotBinding =
  | { kind: 'attr'; name: string; path: number[] }
  | { kind: 'spread'; path: number[] }
  | { kind: 'node'; path: number[] };

export interface CompiledTemplate {
  readonly html: string;
  readonly bindings: readonly SlotBinding[];
  _tpl?: HTMLTemplateElement;
  rawStrings?: readonly string[];
  rawSlots?: readonly { kind: 'attr' | 'node'; name?: string; idx: number }[];
}

export interface SlotView {
  readonly [SLOT]: CompiledTemplate;
  readonly v: readonly any[];
  readonly k?: unknown;
}

export interface CompView<P = any> {
  readonly [COMP]: ComponentFn<P>;
  readonly p: P;
  readonly k?: unknown;
  readonly src?: string;
}

export type ComponentFn<P = any> = (props: P, ctx: Ctx<P>) => any;

export type View = SlotView | CompView | View[] | string | number | boolean | null | undefined;

// =============================================================================
// 1. Minimal Signal (~35 lines) — Shared / Cross-Component Pub-Sub
// =============================================================================
interface Observer {
  deps: Set<Set<Observer>>;
  notify(): void;
}

let activeObserver: Observer | null = null;

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const subs = new Set<Observer>();

  function read(): T {
    if (activeObserver) {
      subs.add(activeObserver);
      activeObserver.deps.add(subs);
    }
    return value;
  }
  read.peek = () => value;
  read.set = (next: T) => {
    if (Object.is(value, next)) return;
    value = next;
    for (const sub of [...subs]) sub.notify();
  };
  read.update = (fn: (prev: T) => T) => read.set(fn(value));
  return read;
}

// =============================================================================
// 2. Tree-Scoped Context (Client + SSR Request-Isolated)
// =============================================================================
export interface AsyncContextStorage {
  getStore(): Record<symbol, any> | null | undefined;
  run<R>(store: Record<symbol, any> | null, fn: () => R): R;
}

let activeContextMap: Record<symbol, any> | null = null;
let asyncContextStorage: AsyncContextStorage | null = null;

function getContextMap(): Record<symbol, any> | null {
  return activeContextMap ?? asyncContextStorage?.getStore() ?? null;
}

export function createContext<T>(defaultValue: T): Context<T> {
  return { id: Symbol('aster.ctx'), defaultValue };
}

export function provide<T>(context: Context<T>, value: T): void {
  const ctxMap = getContextMap();
  if (!ctxMap) {
    throw new Error('[Aster] provide() must be called inside a component render.');
  }
  ctxMap[context.id] = value;
}

export function useContext<T>(context: Context<T>): T {
  const ctxMap = getContextMap();
  if (ctxMap && context.id in ctxMap) {
    return ctxMap[context.id] as T;
  }
  return context.defaultValue;
}

export function Provider<T>(props: { context: Context<T>; value: T; children?: View }): View {
  provide(props.context, props.value);
  return props.children ?? null;
}

/** @internal Register an AsyncLocalStorage-compatible store for concurrent async SSR. */
export function _setAsyncContextStorage(storage: AsyncContextStorage | null): void {
  asyncContextStorage = storage;
}

/** @internal Execute `fn` with a specific prototype-chained context map (used by SSR & client runner). */
export function _runWithContext<R>(map: Record<symbol, any> | null, fn: () => R): R {
  const runSync = () => {
    const prev = activeContextMap;
    activeContextMap = map;
    try {
      return fn();
    } finally {
      activeContextMap = prev;
    }
  };
  return asyncContextStorage ? asyncContextStorage.run(map, runSync) : runSync();
}

// =============================================================================
// 3. Precompiled Slot Templates (_tpl / _slot / _comp) + Context-Aware Parsing
// =============================================================================
export function _tpl(htmlStr: string, bindings: readonly SlotBinding[]): CompiledTemplate {
  return { html: htmlStr, bindings };
}

export function _slot(tpl: CompiledTemplate, values: readonly any[], key?: unknown): SlotView {
  return key !== undefined ? { [SLOT]: tpl, v: values, k: key } : { [SLOT]: tpl, v: values };
}

export function _comp<P>(
  fn: ComponentFn<P>,
  props: P = {} as P,
  key?: unknown,
  src?: string,
): CompView<P> {
  const resolvedSrc = src ?? (fn as any)?.__asterSrc;
  const node: any = { [COMP]: fn, p: props };
  if (key !== undefined) node.k = key;
  if (resolvedSrc !== undefined) node.src = resolvedSrc;
  return node;
}

const SVG_CHILD_TAGS = new Set([
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'ellipse',
  'g',
  'text',
  'tspan',
  'textPath',
  'defs',
  'use',
  'symbol',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feGaussianBlur',
  'feOffset',
  'feMerge',
  'feMergeNode',
  'foreignObject',
  'image',
  'marker',
  'animate',
]);

const TABLE_WRAPPERS: Record<string, [string, string, number]> = {
  tr: ['<table><tbody>', '</tbody></table>', 2],
  td: ['<table><tbody><tr>', '</tr></tbody></table>', 3],
  th: ['<table><tbody><tr>', '</tr></tbody></table>', 3],
  thead: ['<table>', '</table>', 1],
  tbody: ['<table>', '</table>', 1],
  tfoot: ['<table>', '</table>', 1],
  colgroup: ['<table>', '</table>', 1],
  caption: ['<table>', '</table>', 1],
  col: ['<table><colgroup>', '</colgroup></table>', 2],
  option: ['<select>', '</select>', 1],
  optgroup: ['<select>', '</select>', 1],
};

function getTemplateEl(compiled: CompiledTemplate): HTMLTemplateElement {
  if (!compiled._tpl) {
    const el = document.createElement('template');
    const tagMatch = compiled.html.match(/^\s*<([a-zA-Z][\w-]*)/);
    const rawTag = tagMatch ? tagMatch[1] : '';
    const lowerTag = rawTag.toLowerCase();

    if (lowerTag in TABLE_WRAPPERS) {
      const [prefix, suffix, unwrapDepth] = TABLE_WRAPPERS[lowerTag];
      const holder = document.createElement('template');
      holder.innerHTML = `${prefix}${compiled.html}${suffix}`;
      let container: Node = holder.content;
      for (let i = 0; i < unwrapDepth; i++) {
        container = container.firstChild!;
      }
      while (container.firstChild) {
        el.content.appendChild(container.firstChild);
      }
    } else if (SVG_CHILD_TAGS.has(rawTag) || SVG_CHILD_TAGS.has(lowerTag)) {
      const holder = document.createElement('template');
      holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${compiled.html}</svg>`;
      const svgEl = holder.content.firstChild!;
      while (svgEl.firstChild) {
        el.content.appendChild(svgEl.firstChild);
      }
    } else {
      el.innerHTML = compiled.html;
    }

    compiled._tpl = el;
  }
  return compiled._tpl;
}

function pathToNode(root: Node, path: readonly number[]): Node {
  let cur: Node = root;
  for (let i = 0; i < path.length; i++) {
    cur = cur.childNodes[path[i]];
  }
  return cur;
}

/**
 * Resolve a precomputed template integer `path` inside live SSR DOM that contains
 * `<!--aster-s:N-->...<!--aster:N-->` dynamic range markers. Skips dynamic slot interiors
 * so logical child indices match the compiled `<template>` 1-to-1.
 */
function claimPathToNode(
  root: Node,
  path: readonly number[],
  rangeStart: Node | null,
): Node | null {
  let cur: Node = root;
  for (let level = 0; level < path.length; level++) {
    const targetIdx = path[level];
    let c: Node | null = level === 0 && rangeStart ? rangeStart.nextSibling : cur.firstChild;
    let logicalIdx = 0;
    let matched: Node | null = null;

    while (c) {
      if (c.nodeType === 8 && (c as Comment).data.startsWith('aster-s:')) {
        let depth = 1;
        c = c.nextSibling;
        while (c && depth > 0) {
          if (c.nodeType === 8) {
            const d = (c as Comment).data;
            if (d.startsWith('aster-s:')) depth++;
            else if (d.startsWith('aster:')) depth--;
          }
          if (depth === 0) break;
          c = c.nextSibling;
        }
        if (!c) return null;
      }

      if (logicalIdx === targetIdx) {
        matched = c;
        break;
      }
      logicalIdx++;
      c = c.nextSibling;
    }

    if (!matched) return null;
    cur = matched;
  }
  return cur;
}

function findSsrSlotStart(anchor: Node): Comment | null {
  let depth = 1;
  let cur: Node | null = anchor.previousSibling;
  while (cur) {
    if (cur.nodeType === 8) {
      const d = (cur as Comment).data;
      if (d.startsWith('aster:')) depth++;
      else if (d.startsWith('aster-s:')) {
        depth--;
        if (depth === 0) return cur as Comment;
      }
    }
    cur = cur.previousSibling;
  }
  return null;
}

function getPath(root: Node, node: Node): number[] {
  const path: number[] = [];
  let cur: Node | null = node;
  while (cur && cur !== root) {
    const parent: Node | null = cur.parentNode;
    if (!parent) break;
    let idx = 0;
    for (let c = parent.firstChild; c && c !== cur; c = c.nextSibling) idx++;
    path.push(idx);
    cur = parent;
  }
  return path.reverse();
}

const tplCache = new WeakMap<TemplateStringsArray, CompiledTemplate>();

export function html(strings: TemplateStringsArray, ...values: any[]): SlotView {
  let cached = tplCache.get(strings);
  if (!cached) {
    let markup = '';
    const slots: { kind: 'attr' | 'node'; name?: string; idx: number }[] = [];
    let inTag = false;
    let quote = '';
    let stripQ = '';

    for (let i = 0; i < strings.length; i++) {
      let chunk = strings[i];
      if (stripQ && chunk.startsWith(stripQ)) chunk = chunk.slice(1);
      stripQ = '';

      for (let j = 0; j < chunk.length; j++) {
        const ch = chunk[j];
        if (quote) {
          if (ch === quote) quote = '';
        } else if (inTag) {
          if (ch === '"' || ch === "'") quote = ch;
          else if (ch === '>') inTag = false;
        } else if (ch === '<' && /[A-Za-z/!]/.test(chunk[j + 1] || '')) {
          inTag = true;
        }
      }

      if (i < strings.length - 1) {
        if (inTag) {
          const m = chunk.match(/([\w:.-]+)\s*=\s*(["']?)$/);
          if (m) {
            if (m[2]) {
              quote = '';
              stripQ = m[2];
            }
            markup += chunk.slice(0, chunk.length - m[0].length) + `data-aster-a${i}=""`;
            slots.push({ kind: 'attr', name: m[1], idx: i });
            continue;
          }
        }
        markup += chunk + `<!--aster:${i}-->`;
        slots.push({ kind: 'node', idx: i });
      } else {
        markup += chunk;
      }
    }

    cached = {
      html: markup,
      bindings: slots.map((s): SlotBinding =>
        s.kind === 'attr' ? { kind: 'attr', name: s.name!, path: [] } : { kind: 'node', path: [] },
      ),
      rawStrings: strings,
      rawSlots: slots,
    };
    tplCache.set(strings, cached);
  }
  if (typeof document !== 'undefined' && !cached._tpl) {
    const slots = cached.rawSlots!;
    const template = getTemplateEl(cached);
    const frag = template.content;
    const bindings: SlotBinding[] = new Array(slots.length);
    const walker = document.createTreeWalker(
      frag,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
    );
    const cleanup: [Element, string][] = [];

    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 1) {
        const el = node as Element;
        for (const s of slots) {
          if (s.kind === 'attr') {
            const marker = `data-aster-a${s.idx}`;
            if (el.hasAttribute(marker)) {
              bindings[s.idx] = { kind: 'attr', name: s.name!, path: getPath(frag, el) };
              cleanup.push([el, marker]);
            }
          }
        }
      } else if (node.nodeType === 8 && (node as Comment).data.startsWith('aster:')) {
        const idx = Number((node as Comment).data.slice(6));
        bindings[idx] = { kind: 'node', path: getPath(frag, node) };
      }
    }
    for (const [el, marker] of cleanup) el.removeAttribute(marker);

    cached = {
      html: cached.html,
      bindings,
      _tpl: template,
      rawStrings: strings,
      rawSlots: slots,
    };
    tplCache.set(strings, cached);
  }
  return _slot(cached, values);
}

// =============================================================================
// 4. Styling Helpers (css`...` Constructable Stylesheet & scope`...` @scope)
// =============================================================================
let scopeSeq = 0;

export function css(strings: TemplateStringsArray, ...values: any[]): CSSStyleSheet {
  const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? values[i] : ''), '');
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  return sheet;
}

export function scope(strings: TemplateStringsArray, ...values: any[]): string {
  const id = `aster-s${++scopeSeq}`;
  const raw = strings.reduce((acc, s, i) => acc + s + (i < values.length ? values[i] : ''), '');
  if (typeof document !== 'undefined' && 'adoptedStyleSheets' in document) {
    const sheet = new CSSStyleSheet();
    const supportsAtScope = typeof (globalThis as any).CSSScopeRule !== 'undefined';
    const cssText = supportsAtScope
      ? `@scope (.${id}) {\n${raw}\n}`
      : `.${id} {\n${raw.replaceAll(':scope', '&')}\n}`;
    sheet.replaceSync(cssText);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  return id;
}

// =============================================================================
// 5. Slot Mounting, Flat-Array Patching, Spread Props, & Keyed Array Diffing
// =============================================================================
interface Owner {
  schedule(): void;
  onCleanup(cb: () => void): void;
  onError?: (err: unknown) => void;
  context: Record<symbol, any> | null;
}

export interface ClaimRange {
  parent: Node;
  start: Comment | null;
  end: Comment | null;
}

function clearRange(start: Node, end: Node) {
  let cur = start.nextSibling;
  while (cur && cur !== end) {
    const next = cur.nextSibling;
    cur.remove();
    cur = next;
  }
}

function toKebab(prop: string): string {
  return prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

export function isAttributeName(name: string): boolean {
  return /^[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(name);
}

function setAttr(
  el: any,
  name: string,
  next: any,
  prev: any,
  owner: Owner | null,
  state: any,
  claiming: boolean,
) {
  if (name === 'key' || name === 'children' || !isAttributeName(name)) return;

  if (name === 'ref') {
    if (!state.reffed && typeof next === 'function') {
      state.reffed = true;
      next(el);
    }
    return;
  }

  if (
    name.startsWith('on:') ||
    (name.startsWith('on') && name.length > 2 && name[2] === name[2].toUpperCase())
  ) {
    const evName = name.startsWith('on:') ? name.slice(3) : name.slice(2).toLowerCase();
    state.fn = next;
    if (!state.bound) {
      state.bound = (e: Event) => {
        const fn = state.fn;
        if (typeof fn !== 'function') return;
        const res = fn(e);
        owner?.schedule();
        if (res && typeof res.finally === 'function') {
          res.finally(() => owner?.schedule());
        }
      };
      el.addEventListener(evName, state.bound);
      state.unlisten = () => el.removeEventListener(evName, state.bound);
    }
    return;
  }

  // Event props only accept handlers via the listener path above.
  if (/^on/i.test(name)) return;

  if (name === 'bind:value' || name === 'bind:checked' || name === 'bind:open') {
    const isTuple = Array.isArray(next);
    const get = isTuple ? next[0] : next;
    const set = isTuple ? next[1] : next?.set;
    state.set = set;

    // During Lazy Revival claiming, preserve any user input typed before the component woke up!
    if (claiming && !state.bound) {
      if (name === 'bind:checked') set?.(Boolean(el.checked));
      else if (name === 'bind:open') set?.(Boolean(el.open));
      else if (
        (el.value !== '' || el.defaultValue !== '') &&
        el.value !== String((typeof get === 'function' ? get() : get) ?? '')
      ) {
        set?.(el.type === 'number' || el.type === 'range' ? Number(el.value) : el.value);
      }
    }

    const val = typeof get === 'function' ? get() : get;
    if (name === 'bind:checked') {
      if (el.checked !== Boolean(val)) el.checked = Boolean(val);
    } else if (name === 'bind:open') {
      if (el.tagName === 'DIALOG') {
        if (val && !el.open) el.showModal?.();
        else if (!val && el.open) el.close?.();
      } else if (el.open !== Boolean(val)) {
        el.open = Boolean(val);
      }
    } else {
      const str = val == null ? '' : String(val);
      if (el.value !== str) el.value = str;
    }

    if (!state.bound) {
      const ev =
        name === 'bind:open'
          ? el.tagName === 'DIALOG'
            ? 'close'
            : 'toggle'
          : name === 'bind:checked' || el.tagName === 'SELECT'
            ? 'change'
            : 'input';
      state.bound = () => {
        const raw =
          name === 'bind:checked'
            ? el.checked
            : name === 'bind:open'
              ? el.open
              : el.type === 'number' || el.type === 'range'
                ? Number(el.value)
                : el.value;
        state.set?.(raw);
        owner?.schedule();
      };
      el.addEventListener(ev, state.bound);
      state.unlisten = () => el.removeEventListener(ev, state.bound);
    }
    return;
  }

  if (name.startsWith('class:')) {
    el.classList.toggle(name.slice(6), Boolean(next));
    return;
  }

  if (name.startsWith('style:')) {
    el.style.setProperty(toKebab(name.slice(6)), next ?? '');
    return;
  }
  if (name.startsWith('var:')) {
    el.style.setProperty('--' + name.slice(4), next ?? '');
    return;
  }

  if (name === 'style' && next && typeof next === 'object') {
    const prevObj = prev && typeof prev === 'object' ? prev : null;
    if (prevObj) {
      for (const k of Object.keys(prevObj)) {
        if (!(k in next)) el.style.removeProperty(toKebab(k));
      }
    }
    for (const [k, v] of Object.entries(next)) {
      if (!prevObj || !Object.is(prevObj[k], v)) {
        el.style.setProperty(toKebab(k), v == null ? '' : String(v));
      }
    }
    return;
  }

  if (Object.is(prev, next)) return;

  const attr = name === 'className' ? 'class' : name;
  if (attr.startsWith('aria-') && typeof next === 'boolean') {
    el.setAttribute(attr, String(next));
    return;
  }

  if (next === false || next == null) {
    el.removeAttribute(attr);
    if (attr in el && typeof el[attr] === 'boolean') el[attr] = false;
  } else if (next === true) {
    el.setAttribute(attr, '');
    if (attr in el && typeof el[attr] === 'boolean') el[attr] = true;
  } else {
    el.setAttribute(attr, String(next));
    if (attr === 'value' && 'value' in el && el.value !== String(next)) el.value = String(next);
  }
}

function setSpread(
  el: any,
  next: any,
  prev: any,
  owner: Owner | null,
  state: any,
  claiming: boolean,
) {
  const nextObj = next && typeof next === 'object' ? next : null;
  const prevObj = prev && typeof prev === 'object' ? prev : null;
  if (!state.keys) state.keys = Object.create(null);

  if (prevObj) {
    for (const k of Object.keys(prevObj)) {
      if (!nextObj || !(k in nextObj)) {
        const ks = state.keys[k] ?? (state.keys[k] = {});
        setAttr(el, k, null, prevObj[k], owner, ks, claiming);
        ks.unlisten?.();
        delete state.keys[k];
      }
    }
  }

  if (nextObj) {
    for (const k of Object.keys(nextObj)) {
      const ks = state.keys[k] ?? (state.keys[k] = {});
      setAttr(el, k, nextObj[k], prevObj?.[k], owner, ks, claiming);
    }
  }
}

function mountSlot(
  compiled: CompiledTemplate,
  values: readonly any[],
  parent: Node,
  before: Node | null,
  owner: Owner | null,
  claimTarget?: ClaimRange,
) {
  let start: Comment;
  let end: Comment;
  let nodes: Node[];
  let claiming = Boolean(claimTarget);

  if (claimTarget) {
    // Resolve every binding against live SSR DOM skipping <!--aster-s:N-->...<!--aster:N--> interiors
    const resolved: (Node | null)[] = compiled.bindings.map((b) =>
      claimPathToNode(claimTarget.parent, b.path, claimTarget.start),
    );
    const valid = resolved.every((n) => n != null);

    if (valid) {
      nodes = resolved as Node[];
      if (claimTarget.start && claimTarget.end) {
        start = claimTarget.start;
        start.data = '';
        end = document.createComment('');
        claimTarget.parent.insertBefore(end, claimTarget.end);
      } else {
        start = document.createComment('');
        end = document.createComment('');
        claimTarget.parent.insertBefore(start, claimTarget.parent.firstChild);
        claimTarget.parent.appendChild(end);
      }
    } else {
      // Graceful SSR mismatch fallback: clear claimed range and mount fresh
      claiming = false;
      if (claimTarget.start && claimTarget.end) {
        clearRange(claimTarget.start, claimTarget.end);
        claimTarget.start.remove();
        before = claimTarget.end;
        parent = claimTarget.parent;
      } else {
        (claimTarget.parent as Element).textContent = '';
        parent = claimTarget.parent;
        before = null;
      }
      const frag = getTemplateEl(compiled).content.cloneNode(true) as DocumentFragment;
      nodes = compiled.bindings.map((b) => pathToNode(frag, b.path));
      start = document.createComment('');
      end = document.createComment('');
      parent.insertBefore(start, before);
      parent.insertBefore(frag, before);
      parent.insertBefore(end, before);
    }
  } else {
    const frag = getTemplateEl(compiled).content.cloneNode(true) as DocumentFragment;
    nodes = compiled.bindings.map((b) => pathToNode(frag, b.path));
    start = document.createComment('');
    end = document.createComment('');
    parent.insertBefore(start, before);
    parent.insertBefore(frag, before);
    parent.insertBefore(end, before);
  }

  const states: any[] = compiled.bindings.map(() => ({}));
  const prevValues: any[] = new Array(values.length).fill(Symbol('init'));

  function patch(nextValues: readonly any[], isClaim = false) {
    for (let i = 0; i < compiled.bindings.length; i++) {
      const b = compiled.bindings[i];
      const next = nextValues[i];
      const prev = prevValues[i];
      prevValues[i] = next;

      if (b.kind === 'attr') {
        setAttr(nodes[i], b.name, next, prev, owner, states[i], isClaim);
      } else if (b.kind === 'spread') {
        setSpread(nodes[i], next, prev, owner, states[i], isClaim);
      } else {
        patchNodeSlot(nodes[i], next, states[i], owner, isClaim);
      }
    }
  }

  const inst = {
    tpl: compiled,
    patch: (v: readonly any[]) => patch(v, false),
    dispose() {
      for (const st of states) {
        st.unlisten?.();
        if (st.keys) {
          for (const key of Object.keys(st.keys)) st.keys[key].unlisten?.();
        }
        disposeNodeSlot(st);
      }
      clearRange(start, end);
      start.remove();
      end.remove();
    },
  };

  try {
    patch(values, claiming);
  } catch (err) {
    inst.dispose();
    throw err;
  }

  return inst;
}

function wrapChildProps(props: any, parentOwner: Owner | null): any {
  if (!parentOwner || !props || typeof props !== 'object') return props;
  let wrapped: any = null;
  for (const key of Object.keys(props)) {
    const val = props[key];
    if (
      typeof val === 'function' &&
      (key.startsWith('on:') ||
        (key.startsWith('on') && key.length > 2 && key[2] === key[2].toUpperCase()))
    ) {
      if (!wrapped) wrapped = { ...props };
      wrapped[key] = (...args: any[]) => {
        const res = val(...args);
        parentOwner.schedule();
        if (res && typeof res.finally === 'function') {
          res.finally(() => parentOwner.schedule());
        }
        return res;
      };
    }
  }
  return wrapped ?? props;
}

function patchNodeSlot(anchor: Node, next: any, state: any, owner: Owner | null, isClaim = false) {
  const ssrStart = isClaim ? findSsrSlotStart(anchor) : null;

  // 1. Nested Slot Template
  if (next && typeof next === 'object' && next[SLOT]) {
    if (state.child && state.child.tpl === next[SLOT]) {
      state.child.patch(next.v);
      return;
    }
    disposeNodeSlot(state);
    if (ssrStart) {
      state.child = mountSlot(next[SLOT], next.v, anchor.parentNode!, anchor, owner, {
        parent: anchor.parentNode!,
        start: ssrStart,
        end: anchor as Comment,
      });
    } else {
      state.child = mountSlot(next[SLOT], next.v, anchor.parentNode!, anchor, owner);
    }
    return;
  }

  // 2. Child Component (function / function* / async function*)
  if (next && typeof next === 'object' && next[COMP]) {
    const childProps = wrapChildProps(next.p, owner);
    const nextErr = childProps?.__asterOnError ?? owner?.onError;
    if (state.child && state.child.fn === next[COMP] && Object.is(state.child.key, next.k)) {
      state.child.update(childProps);
      return;
    }
    disposeNodeSlot(state);
    const claimRange = ssrStart
      ? { parent: anchor.parentNode!, start: ssrStart, end: anchor as Comment }
      : undefined;
    state.child = mountComponent(
      next[COMP],
      childProps,
      anchor.parentNode!,
      anchor,
      claimRange,
      nextErr,
      next.k,
      owner?.context ?? null,
    );
    return;
  }

  // 3. Array (Keyed reconciliation via .k property, or index-keyed fallback)
  if (Array.isArray(next)) {
    if (ssrStart) {
      const ends: Comment[] = [];
      let cursor: Node | null = anchor.previousSibling;
      for (let i = next.length - 1; i >= 0 && cursor?.nodeType === 8; i--) {
        if ((cursor as Comment).data !== 'aster:' + i) break;
        ends.push(cursor as Comment);
        cursor = findSsrSlotStart(cursor)?.previousSibling ?? null;
      }
      if (ends.length === next.length && cursor === ssrStart) {
        ends.reverse();
        state.arrayEntries = next.map((item, i) =>
          mountArrayEntry(item, getItemKey(item, i), anchor, owner, ends[i]),
        );
        ssrStart.remove();
        return;
      }
      clearRange(ssrStart, anchor);
      ssrStart.remove();
    }
    patchArray(anchor, next, state, owner);
    return;
  }

  // 4. Primitive / Text / Empty
  if (state.child || state.arrayEntries) disposeNodeSlot(state);
  const text = next == null || next === false || next === true ? '' : String(next);

  if (ssrStart) {
    // Adopt existing SSR Text node in-place (zero DOM replacement!)
    const first = ssrStart.nextSibling;
    if (first && first.nodeType === 3 && first.nextSibling === anchor) {
      state.textNode = first as Text;
      if (state.textNode.data !== text) state.textNode.data = text;
      ssrStart.remove();
      return;
    }
    clearRange(ssrStart, anchor);
    ssrStart.remove();
  }

  if (!state.textNode) {
    state.textNode = document.createTextNode(text);
    anchor.parentNode!.insertBefore(state.textNode, anchor);
  } else if (state.textNode.data !== text) {
    state.textNode.data = text;
  }
}

function disposeNodeSlot(state: any) {
  if (state.textNode) {
    state.textNode.remove();
    state.textNode = null;
  }
  if (state.child) {
    state.child.dispose();
    state.child = null;
  }
  if (state.arrayEntries) {
    for (const entry of state.arrayEntries) entry.dispose();
    state.arrayEntries = null;
  }
}

interface ArrayEntry {
  key: unknown;
  start: Comment;
  end: Comment;
  update(v: any): void;
  moveBefore(refNode: Node): void;
  dispose(): void;
}

function getItemKey(item: any, index: number): unknown {
  return item && typeof item === 'object' && 'k' in item && item.k !== undefined ? item.k : index;
}

function mountArrayEntry(
  item: any,
  key: unknown,
  before: Node,
  owner: Owner | null,
  claimedEnd?: Comment,
): ArrayEntry {
  const boxStart = document.createComment('');
  const boxEnd = claimedEnd ?? document.createComment('');
  const parent = before.parentNode!;
  parent.insertBefore(boxStart, claimedEnd ? findSsrSlotStart(claimedEnd) : before);
  if (!claimedEnd) parent.insertBefore(boxEnd, before);
  const innerState = {};
  patchNodeSlot(boxEnd, item, innerState, owner, Boolean(claimedEnd));
  boxEnd.data = '';
  return {
    key,
    start: boxStart,
    end: boxEnd,
    update(v: any) {
      patchNodeSlot(boxEnd, v, innerState, owner);
    },
    moveBefore(refNode: Node) {
      const p = refNode.parentNode!;
      let cur: Node | null = boxStart;
      while (cur) {
        const nxt: Node | null = cur.nextSibling;
        p.insertBefore(cur, refNode);
        if (cur === boxEnd) break;
        cur = nxt;
      }
    },
    dispose() {
      disposeNodeSlot(innerState);
      clearRange(boxStart, boxEnd);
      boxStart.remove();
      boxEnd.remove();
    },
  };
}

/** O(n log n) Longest Increasing Subsequence of positive entries (0 = newly mounted, ignored). */
function getLongestIncreasingSubsequence(arr: ArrayLike<number>): number[] {
  const n = arr.length;
  const p = new Int32Array(n);
  const result: number[] = [];

  for (let i = 0; i < n; i++) {
    const v = arr[i];
    if (v === 0) continue;
    const lastIdx = result.length - 1;
    if (lastIdx >= 0 && arr[result[lastIdx]] < v) {
      p[i] = result[lastIdx];
      result.push(i);
      continue;
    }
    let lo = 0;
    let hi = lastIdx;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[result[mid]] < v) lo = mid + 1;
      else hi = mid;
    }
    if (result.length === 0) {
      result.push(i);
    } else if (v < arr[result[lo]]) {
      if (lo > 0) p[i] = result[lo - 1];
      result[lo] = i;
    }
  }

  let u = result.length;
  if (u === 0) return [];
  let v = result[u - 1];
  const out = new Array<number>(u);
  while (u-- > 0) {
    out[u] = v;
    v = p[v];
  }
  return out;
}

/**
 * Minimal-move keyed array reconciliation (prefix/suffix trim + O(n log n) LIS).
 * Guarantees optimal DOM mutations for appends, prepends, swaps, and large shuffles.
 */
function patchArray(anchor: Node, items: readonly any[], state: any, owner: Owner | null) {
  if (state.textNode || state.child) disposeNodeSlot(state);
  const oldEntries: ArrayEntry[] = state.arrayEntries ?? [];
  const oldLen = oldEntries.length;
  const newLen = items.length;

  // Fast path: cleared list
  if (newLen === 0) {
    for (let i = 0; i < oldLen; i++) oldEntries[i].dispose();
    state.arrayEntries = [];
    return;
  }

  // Extract unique keys (warn & disambiguate if duplicate keys appear)
  const newKeys = new Array<unknown>(newLen);
  const seenKeys = new Set<unknown>();
  for (let i = 0; i < newLen; i++) {
    let k = getItemKey(items[i], i);
    if (seenKeys.has(k)) {
      if (__DEV__) {
        console.warn(
          `[Aster] Duplicate key "${String(k)}" detected in list. Ensure every item has a unique key.`,
        );
      }
      k = Symbol(`dup:${String(k)}:${i}`);
    }
    seenKeys.add(k);
    newKeys[i] = k;
  }

  // Fast path: initial mount
  if (oldLen === 0) {
    const mounted = new Array<ArrayEntry>(newLen);
    for (let i = 0; i < newLen; i++) {
      mounted[i] = mountArrayEntry(items[i], newKeys[i], anchor, owner);
    }
    state.arrayEntries = mounted;
    return;
  }

  const nextEntries = new Array<ArrayEntry>(newLen);

  // 1. Sync common prefix
  let s = 0;
  while (s < oldLen && s < newLen && Object.is(oldEntries[s].key, newKeys[s])) {
    oldEntries[s].update(items[s]);
    nextEntries[s] = oldEntries[s];
    s++;
  }

  // 2. Sync common suffix
  let eOld = oldLen - 1;
  let eNew = newLen - 1;
  while (eOld >= s && eNew >= s && Object.is(oldEntries[eOld].key, newKeys[eNew])) {
    oldEntries[eOld].update(items[eNew]);
    nextEntries[eNew] = oldEntries[eOld];
    eOld--;
    eNew--;
  }

  // 3. Pure insertion in the middle/head/tail (zero moves)
  if (s > eOld) {
    const before: Node = eNew + 1 < newLen ? nextEntries[eNew + 1].start : anchor;
    for (let i = s; i <= eNew; i++) {
      nextEntries[i] = mountArrayEntry(items[i], newKeys[i], before, owner);
    }
    state.arrayEntries = nextEntries;
    return;
  }

  // 4. Pure removal in the middle/head/tail (zero moves)
  if (s > eNew) {
    for (let i = s; i <= eOld; i++) oldEntries[i].dispose();
    state.arrayEntries = nextEntries;
    return;
  }

  // 5. General middle diff with LIS minimal DOM moves
  const keyToNewIndex = new Map<unknown, number>();
  for (let i = s; i <= eNew; i++) {
    keyToNewIndex.set(newKeys[i], i);
  }

  const toBePatched = eNew - s + 1;
  const newIndexToOldIndex = new Int32Array(toBePatched);
  let moved = false;
  let maxNewIndexSoFar = 0;

  for (let i = s; i <= eOld; i++) {
    const oldEntry = oldEntries[i];
    const newIdx = keyToNewIndex.get(oldEntry.key);
    if (newIdx === undefined) {
      oldEntry.dispose();
    } else {
      newIndexToOldIndex[newIdx - s] = i + 1;
      oldEntry.update(items[newIdx]);
      nextEntries[newIdx] = oldEntry;
      if (newIdx >= maxNewIndexSoFar) {
        maxNewIndexSoFar = newIdx;
      } else {
        moved = true;
      }
    }
  }

  const lis = moved ? getLongestIncreasingSubsequence(newIndexToOldIndex) : [];
  let lisPtr = lis.length - 1;

  for (let i = toBePatched - 1; i >= 0; i--) {
    const nextIdx = s + i;
    const before: Node = nextIdx + 1 < newLen ? nextEntries[nextIdx + 1].start : anchor;
    if (newIndexToOldIndex[i] === 0) {
      nextEntries[nextIdx] = mountArrayEntry(items[nextIdx], newKeys[nextIdx], before, owner);
    } else if (moved) {
      if (lisPtr < 0 || i !== lis[lisPtr]) {
        nextEntries[nextIdx].moveBefore(before);
      } else {
        lisPtr--;
      }
    }
  }

  state.arrayEntries = nextEntries;
}

// =============================================================================
// 6. HMR Registry (Dev-Only In-Place Component Hot-Swap)
// =============================================================================
interface HmrHandle {
  replace(nextFn: ComponentFn): void;
}

const hmrRegistry = __DEV__ ? new Map<string, Set<HmrHandle>>() : null;

function registerHmr(id: string | undefined, handle: HmrHandle): (() => void) | null {
  if (!__DEV__ || !id || !hmrRegistry) return null;
  let set = hmrRegistry.get(id);
  if (!set) {
    set = new Set();
    hmrRegistry.set(id, set);
  }
  set.add(handle);
  return () => {
    set!.delete(handle);
    if (set!.size === 0) hmrRegistry.delete(id);
  };
}

export function __asterHmrAccept(moduleUrl: string, nextMod: Record<string, any>) {
  if (!__DEV__ || !hmrRegistry) return;
  const prefix = `${moduleUrl}#`;
  for (const [id, handles] of [...hmrRegistry.entries()]) {
    if (!id.startsWith(prefix)) continue;
    const exportName = id.slice(prefix.length);
    const nextFn = nextMod[exportName];
    if (typeof nextFn === 'function') {
      for (const h of [...handles]) h.replace(nextFn);
    }
  }
}

// =============================================================================
// 7. Component Runner: function, function*, and async function*
// =============================================================================
function shallowEqualProps(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i];
    if (!(k in b)) return false;
    if (typeof a[k] === 'function' && typeof b[k] === 'function') continue;
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

export interface ComponentHandle {
  fn: ComponentFn;
  key?: unknown;
  update(nextProps: any): void;
  dispose(): void;
}

export function mountComponent(
  initialFn: ComponentFn,
  initialProps: any,
  parent: Node,
  before: Node | null,
  claimTarget?: ClaimRange | Element,
  onError?: (err: unknown) => void,
  key?: unknown,
  parentContext: Record<symbol, any> | null = null,
): ComponentHandle {
  let claimRange: ClaimRange | undefined = claimTarget
    ? 'parent' in claimTarget
      ? claimTarget
      : { parent: claimTarget, start: null, end: null }
    : undefined;

  const start = document.createComment('');
  const end = document.createComment('');
  if (!claimRange) {
    parent.insertBefore(start, before);
    parent.insertBefore(end, before);
  }

  const localContext: Record<symbol, any> = Object.create(parentContext);
  let activeFn = initialFn;
  let currentProps = initialProps;
  let disposed = false;
  let running = false;
  let dirty = false;
  let scheduled = false;
  let gen: any = null;
  let isAsync = false;
  let asyncRunId = 0;
  let cleanups = new Set<() => void>();
  let ac = new AbortController();
  const slotState: any = {};

  const observer: Observer = {
    deps: new Set(),
    notify() {
      schedule();
    },
  };

  function clearDeps() {
    for (const s of observer.deps) s.delete(observer);
    observer.deps.clear();
  }

  const ctx: Ctx = {
    get signal() {
      return ac.signal;
    },
    refresh: () => schedule(),
    onCleanup: (cb) => cleanups.add(cb),
    [Symbol.iterator]() {
      return {
        next() {
          return disposed ? { done: true, value: undefined } : { done: false, value: currentProps };
        },
      };
    },
  };

  const owner: Owner = {
    schedule,
    onCleanup: (cb) => cleanups.add(cb),
    onError,
    context: localContext,
  };

  function applyResult(view: any) {
    if (disposed) return;
    if (claimRange && view && typeof view === 'object' && view[COMP]) {
      const target = claimRange;
      claimRange = undefined;
      slotState.child = mountComponent(
        view[COMP],
        wrapChildProps(view.p, owner),
        target.parent,
        target.end,
        target,
        view.p?.__asterOnError ?? onError,
        view.k,
        localContext,
      );
      target.parent.insertBefore(end, target.end);
      return;
    }
    if (claimRange && Array.isArray(view)) {
      const target = claimRange;
      claimRange = undefined;
      const first = target.start ? target.start.nextSibling : target.parent.firstChild;
      target.parent.insertBefore(start, first);
      target.parent.insertBefore(document.createComment('aster-s:root'), first);
      end.data = 'aster:root';
      target.parent.insertBefore(end, target.end);
      patchNodeSlot(end, view, slotState, owner, true);
      end.data = '';
      return;
    }
    if (claimRange && view && typeof view === 'object' && view[SLOT]) {
      const target = claimRange;
      claimRange = undefined;
      slotState.child = mountSlot(view[SLOT], view.v, target.parent, target.end, owner, target);
      if (target.start && target.end) {
        target.parent.insertBefore(end, target.end);
      } else {
        target.parent.appendChild(end);
      }
      return;
    }
    if (claimRange) {
      const target = claimRange;
      claimRange = undefined;
      if (target.start && target.end) {
        clearRange(target.start, target.end);
        target.start.remove();
        target.parent.insertBefore(start, target.end);
        target.parent.insertBefore(end, target.end);
      } else {
        (target.parent as Element).textContent = '';
        target.parent.appendChild(start);
        target.parent.appendChild(end);
      }
    }
    patchNodeSlot(end, view, slotState, owner);
  }

  function stepSync() {
    if (disposed || running) {
      dirty = true;
      return;
    }
    running = true;
    dirty = false;
    clearDeps();

    const prevObs = activeObserver;
    const prevCtx = activeContextMap;
    activeObserver = observer;
    activeContextMap = localContext;
    try {
      if (!gen) {
        const res = activeFn(currentProps, ctx);
        if (res && typeof res[Symbol.asyncIterator] === 'function') {
          gen = res;
          isAsync = true;
          pumpAsync(++asyncRunId, res);
          return;
        }
        if (res && typeof res.next === 'function') {
          gen = res;
          const out = gen.next(currentProps);
          if (__DEV__ && out.done && out.value !== undefined && out.value !== null) {
            console.warn(
              `[Aster] Generator component "${activeFn.name || 'anonymous'}" returned on its first render. ` +
                `Wrap your yield in \`for (props of ctx) { yield ... }\` or \`for (;;) { yield ... }\` so it stays reactive.`,
            );
          }
          if (!out.done || out.value !== undefined) applyResult(out.value);
          return;
        }
        applyResult(res);
      } else if (!isAsync) {
        const out = gen.next(currentProps);
        if (!out.done || out.value !== undefined) applyResult(out.value);
      }
    } catch (err) {
      if (onError) {
        onError(err);
        return;
      }
      throw err;
    } finally {
      activeObserver = prevObs;
      activeContextMap = prevCtx;
      running = false;
      if (dirty && !disposed) schedule();
    }
  }

  async function pumpAsync(runId: number, activeGen: any) {
    try {
      while (!disposed && runId === asyncRunId && gen === activeGen) {
        const out = await _runWithContext(localContext, () => activeGen.next(currentProps));
        if (disposed || runId !== asyncRunId) break;
        if (!out.done || out.value !== undefined) {
          _runWithContext(localContext, () => applyResult(out.value));
        }
        if (out.done) break;
      }
    } catch (err: any) {
      if (disposed || runId !== asyncRunId || err?.name === 'AbortError') return;
      if (onError) {
        onError(err);
      } else {
        console.error('[Aster async generator error]', err);
      }
    }
  }

  function schedule() {
    if (disposed) return;
    dirty = true;
    if (scheduled || running) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!disposed && dirty) stepSync();
    });
  }

  function teardownExecution() {
    asyncRunId++;
    clearDeps();
    ac.abort();
    if (gen && typeof gen.return === 'function') {
      try {
        gen.return();
      } catch (_) {}
    }
    gen = null;
    isAsync = false;
    for (const cb of cleanups) {
      try {
        cb();
      } catch (_) {}
    }
    cleanups = new Set();
    ac = new AbortController();
  }

  let unregisterHmr: (() => void) | null = null;
  if (__DEV__) {
    const hmrId: string | undefined =
      (activeFn as any)?.__asterHmrId ?? (activeFn as any)?.__asterSrc;
    unregisterHmr = registerHmr(hmrId, {
      replace(nextFn: ComponentFn) {
        if (disposed) return;
        teardownExecution();
        activeFn = nextFn;
        handle.fn = nextFn;
        stepSync();
      },
    });
  }

  const handle = {
    fn: activeFn,
    key,
    update(nextProps: any) {
      const prevProps = currentProps;
      currentProps = nextProps;
      if (isAsync) {
        // Restart async function* cleanly when props actually change (aborting prior fetches)
        if (!shallowEqualProps(prevProps, nextProps)) {
          teardownExecution();
          stepSync();
        }
        return;
      }
      stepSync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (__DEV__) unregisterHmr?.();
      teardownExecution();
      disposeNodeSlot(slotState);
      if (start.parentNode) {
        clearRange(start, end);
        start.remove();
        end.remove();
      } else if (end.parentNode) {
        end.remove();
      }
    },
  };

  try {
    stepSync();
  } catch (error) {
    handle.dispose();
    throw error;
  }
  return handle;
}

export function render(view: View, container: Element): () => void {
  container.textContent = '';
  const anchor = document.createComment('aster-root');
  container.appendChild(anchor);
  const state = {};
  patchNodeSlot(anchor, view, state, null);
  return () => {
    disposeNodeSlot(state);
    anchor.remove();
  };
}

// Claim an existing SSR element in-place (used by revive.ts)
export function claim(fn: ComponentFn, props: any, rootEl: Element): ComponentHandle {
  const route = rootEl.getAttribute('data-aster-route');
  const context = route ? { [routeContext.id]: JSON.parse(route) } : null;
  return mountComponent(
    fn,
    props,
    rootEl,
    null,
    { parent: rootEl, start: null, end: null },
    undefined,
    undefined,
    context,
  );
}

// =============================================================================
// 7b. ErrorBoundary — Recovers Closed Generators Cleanly on reset()
// =============================================================================
export function* ErrorBoundary(
  props: {
    fallback: (err: unknown, reset: () => void) => View;
    children?: View;
    onError?: (err: unknown) => void;
  },
  ctx: Ctx<any>,
) {
  let caught: unknown = null;
  let hasError = false;
  let epoch = 0;

  const reset = () => {
    caught = null;
    hasError = false;
    epoch++;
    ctx.refresh();
  };

  const handleChildError = (err: unknown) => {
    caught = err;
    hasError = true;
    props.onError?.(err);
    ctx.refresh();
  };

  for (props of ctx) {
    if (hasError) {
      yield props.fallback(caught, reset);
      continue;
    }
    yield _comp(
      BoundaryInner,
      { children: props.children, __asterOnError: handleChildError },
      epoch,
    );
  }
}

function BoundaryInner(props: { children?: View; __asterOnError?: (err: unknown) => void }): View {
  return props.children ?? null;
}

// =============================================================================
// 8. Unified Web Components (defineElement) — Exact Same Component Function!
// =============================================================================
export type PropType = 'string' | 'number' | 'boolean' | 'json';

export interface DefineElementOptions {
  props?: readonly string[] | Record<string, PropType>;
  shadow?: boolean | 'open' | 'closed';
  styles?: CSSStyleSheet | readonly CSSStyleSheet[];
}

function coerceAttr(raw: string | null, type: PropType): any {
  if (raw === null) return type === 'boolean' ? false : undefined;
  if (type === 'number') return Number(raw);
  if (type === 'boolean') return raw !== 'false';
  if (type === 'json') {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  return raw;
}

export function defineElement<P = any>(
  tagName: string,
  Component: ComponentFn<P>,
  options: DefineElementOptions = {},
): CustomElementConstructor {
  const existing = customElements.get(tagName) as any;
  if (existing) {
    if (typeof existing._asterHotUpdate === 'function') {
      existing._asterHotUpdate(Component, options);
    }
    return existing;
  }

  const schema: Record<string, PropType> = Array.isArray(options.props)
    ? Object.fromEntries(options.props.map((p) => [p, 'string' as const]))
    : (options.props ?? {});
  const propNames = Object.keys(schema);
  let activeComp: ComponentFn<any> = Component;
  let activeStyles = options.styles;
  const instances = new Set<any>();

  class AsterCustomElement extends HTMLElement {
    static observedAttributes = propNames;
    static _asterHotUpdate(nextComp: ComponentFn<any>, nextOpts: DefineElementOptions) {
      activeComp = nextComp;
      activeStyles = nextOpts.styles;
      for (const el of instances) {
        if (options.shadow && activeStyles) {
          const list = Array.isArray(activeStyles) ? activeStyles : [activeStyles];
          (el._root as ShadowRoot).adoptedStyleSheets = [...list];
        }
        el._inst?.dispose();
        el._inst = mountComponent(activeComp, { ...el._props }, el._root, null);
      }
    }

    _props: Record<string, any> = {};
    _inst: ReturnType<typeof mountComponent> | null = null;
    _root: ShadowRoot | HTMLElement;

    constructor() {
      super();
      this._root = options.shadow
        ? this.attachShadow({ mode: options.shadow === 'closed' ? 'closed' : 'open' })
        : this;
      if (options.shadow && activeStyles) {
        const list = Array.isArray(activeStyles) ? activeStyles : [activeStyles];
        (this._root as ShadowRoot).adoptedStyleSheets = [...list];
      }
    }

    connectedCallback() {
      instances.add(this);
      for (const name of propNames) {
        if (!(name in this._props) && this.hasAttribute(name)) {
          this._props[name] = coerceAttr(this.getAttribute(name), schema[name]);
        }
      }
      this._inst = mountComponent(activeComp, { ...this._props }, this._root, null);
    }

    attributeChangedCallback(name: string, _old: string | null, next: string | null) {
      this._props[name] = coerceAttr(next, schema[name]);
      this._inst?.update({ ...this._props });
    }

    disconnectedCallback() {
      instances.delete(this);
      this._inst?.dispose();
      this._inst = null;
    }
  }

  for (const name of propNames) {
    Object.defineProperty(AsterCustomElement.prototype, name, {
      get() {
        return this._props[name];
      },
      set(val: any) {
        this._props[name] = val;
        this._inst?.update({ ...this._props });
      },
    });
  }

  customElements.define(tagName, AsterCustomElement);
  return AsterCustomElement;
}
