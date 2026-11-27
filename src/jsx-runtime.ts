// Aster JSX Runtime & TypeScript 7.x Type Definitions
import {
  _comp,
  _slot,
  _tpl,
  type ComponentFn,
  type CompiledTemplate,
  type SlotBinding,
  type Signal,
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

  export type ElementType = keyof IntrinsicElements | ComponentFn;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicAttributes {
    key?: string | number;
  }

  type Binding<T> = T | Signal<T> | readonly [() => T, (value: T) => void];
  type Handler<E extends globalThis.Element, Ev extends Event> = (
    event: Ev & { currentTarget: E },
  ) => unknown;
  export interface BaseAttrs<
    E extends globalThis.Element = HTMLElement,
  > extends IntrinsicAttributes {
    spellcheck?: boolean | 'false' | 'true';
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
    ref?: (el: E) => void;
    children?: View;
    // Aster native directives
    'bind:value'?: Binding<string> | Binding<number>;
    'bind:checked'?: Binding<boolean>;
    'bind:open'?: Binding<boolean>;
    // Standard DOM events
    onClick?: Handler<E, MouseEvent>;
    onInput?: Handler<E, Event>;
    onChange?: Handler<E, Event>;
    onSubmit?: Handler<E, SubmitEvent>;
    onKeyDown?: Handler<E, KeyboardEvent>;
    onKeyUp?: Handler<E, KeyboardEvent>;
    onFocus?: Handler<E, FocusEvent>;
    onBlur?: Handler<E, FocusEvent>;
    onToggle?: Handler<E, Event>;
    onClose?: Handler<E, Event>;
    // Allow class:*, style:*, var:*, on:*, data-*, aria-*, and custom element attrs
    [key: `class:${string}`]: boolean | undefined;
    [key: `style:${string}`]: string | number | undefined;
    [key: `var:${string}`]: string | number | undefined;
    // Custom event names can carry application-defined CustomEvent details.
    [key: `on:${string}`]:
      | { handle(event: Event & { currentTarget: E }): unknown }['handle']
      | undefined;
    [key: `data-${string}`]: string | number | boolean | undefined;
    [key: `aria-${string}`]: string | number | boolean | undefined;
  }

  // JSX handlers follow the browser event name, with customary word breaks.
  type EventPrefix =
    | 'animation'
    | 'before'
    | 'composition'
    | 'context'
    | 'drag'
    | 'focus'
    | 'key'
    | 'mouse'
    | 'pointer'
    | 'touch'
    | 'transition'
    | 'wheel'
    | 'dbl'
    | 'selection'
    | 'scroll'
    | 'got'
    | 'lost';
  type CamelEvent<K extends string> =
    | {
        [P in EventPrefix]: K extends `${P}${infer Tail}`
          ? Tail extends ''
            ? never
            : `${Capitalize<P>}${CamelEvent<Tail>}`
          : never;
      }[EventPrefix]
    | Capitalize<K>;
  type EventAttrs<E extends globalThis.Element> = {
    [K in keyof GlobalEventHandlersEventMap as `on:${K}` | `on${CamelEvent<K>}`]?: Handler<
      E,
      GlobalEventHandlersEventMap[K]
    >;
  };
  type NativeAttrs<E extends globalThis.Element> = BaseAttrs<E> &
    EventAttrs<E> & {
      [
        K in keyof E as K extends string
          ? K extends keyof BaseAttrs<E> | `on${string}`
            ? never
            : E[K] extends string | number | boolean | null
              ? K | Lowercase<K>
              : never
          : never
      ]?: E[K];
    };

  type HtmlTags = { [K in keyof HTMLElementTagNameMap]: NativeAttrs<HTMLElementTagNameMap[K]> };
  type SvgTags = {
    [K in Exclude<keyof SVGElementTagNameMap, keyof HtmlTags>]: BaseAttrs<SVGElementTagNameMap[K]> &
      EventAttrs<SVGElementTagNameMap[K]> &
      Record<string, unknown>;
  };

  export interface IntrinsicElements extends HtmlTags, SvgTags {
    [tag: `${string}-${string}`]: BaseAttrs<HTMLElement> &
      EventAttrs<HTMLElement> &
      Record<string, unknown>;
  }
}
