// Aster JSX Runtime & TypeScript 7.x Type Definitions
import {
  _comp,
  _slot,
  _tpl,
  type ComponentFn,
  type CompiledTemplate,
  type SlotBinding,
  type View,
} from './runtime.ts';

export { _comp, _slot, _tpl } from './runtime.ts';

export function Fragment(props: { children?: View }): View {
  return props.children ?? null;
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const fallbackTplCache = new Map<string, CompiledTemplate>();

/**
 * Runtime JSX helper.
 * When compiled via `@fierst/aster/vite`, intrinsic tags are lowered at build time into hoisted `_tpl()` / `_slot()`.
 * If executed directly without the Vite plugin (e.g. via `vpx`), this provides a lightweight cached fallback.
 */
export function jsx(type: string | ComponentFn, props: any, key?: unknown): any {
  if (typeof type === 'function') return _comp(type, props ?? {}, key);

  const p = props ?? {};
  const attrNames: string[] = [];
  const values: any[] = [];
  let hasChildren = false;

  for (const k of Object.keys(p)) {
    if (k === 'key') continue;
    if (k === 'children') {
      hasChildren = true;
      continue;
    }
    attrNames.push(k);
    values.push(p[k]);
  }
  if (hasChildren && !VOID_TAGS.has(type)) {
    values.push(p.children);
  }

  const cacheKey = `${type}|${attrNames.join(',')}|${hasChildren ? '1' : '0'}`;
  let compiled = fallbackTplCache.get(cacheKey);
  if (!compiled) {
    const bindings: SlotBinding[] = [];
    let open = `<${type}`;
    for (let i = 0; i < attrNames.length; i++) {
      bindings.push({ kind: 'attr', name: attrNames[i], path: [0] });
      open += ` data-aster-a${i}=""`;
    }
    let htmlStr: string;
    if (VOID_TAGS.has(type)) {
      htmlStr = `${open}>`;
    } else if (hasChildren) {
      const childIdx = bindings.length;
      bindings.push({ kind: 'node', path: [0, 0] });
      htmlStr = `${open}><!--aster:${childIdx}--></${type}>`;
    } else {
      htmlStr = `${open}></${type}>`;
    }
    compiled = _tpl(htmlStr, bindings);
    fallbackTplCache.set(cacheKey, compiled);
  }

  return _slot(compiled, values, key);
}
export const jsxs = jsx;
export const jsxDEV = jsx;

export namespace JSX {
  export type Element = View;

  export type ElementType =
    | keyof IntrinsicElements
    | ((props: any, ctx: any) => View | Generator<View, any, any> | AsyncGenerator<View, any, any>);

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicAttributes {
    key?: string | number;
  }

  export interface BaseAttrs {
    id?: string;
    class?: string;
    className?: string;
    style?: string | Record<string, string | number | undefined>;
    title?: string;
    role?: string;
    tabIndex?: number;
    hidden?: boolean;
    disabled?: boolean;
    type?: string;
    name?: string;
    value?: string | number;
    checked?: boolean;
    placeholder?: string;
    href?: string;
    src?: string;
    alt?: string;
    target?: string;
    rel?: string;
    open?: boolean;
    closedby?: 'any' | 'closerequest' | 'none';
    popover?: '' | 'auto' | 'manual' | 'hint' | boolean;
    popovertarget?: string;
    popovertargetaction?: 'toggle' | 'show' | 'hide';
    commandfor?: string;
    command?: string;
    for?: string;
    ref?: (el: any) => void;
    children?: View;
    // Aster native directives
    'bind:value'?: any;
    'bind:checked'?: any;
    'bind:open'?: any;
    // Standard DOM events
    onClick?: (e: MouseEvent) => any;
    onInput?: (e: Event) => any;
    onChange?: (e: Event) => any;
    onSubmit?: (e: SubmitEvent) => any;
    onKeyDown?: (e: KeyboardEvent) => any;
    onKeyUp?: (e: KeyboardEvent) => any;
    onFocus?: (e: FocusEvent) => any;
    onBlur?: (e: FocusEvent) => any;
    onToggle?: (e: Event) => any;
    onClose?: (e: Event) => any;
    // Allow class:*, style:*, var:*, on:*, data-*, aria-*, and custom element attrs
    [key: `class:${string}`]: boolean | undefined;
    [key: `style:${string}`]: string | number | undefined;
    [key: `var:${string}`]: string | number | undefined;
    [key: `on:${string}`]: ((e: Event) => any) | undefined;
    [key: `data-${string}`]: string | number | boolean | undefined;
    [key: `aria-${string}`]: string | number | boolean | undefined;
    [key: string]: any;
  }

  export interface IntrinsicElements {
    [elemName: string]: BaseAttrs;
  }
}
