# 04. Unified Web Components & Native Styling

Aster eliminates the split between "framework component" and "Web Component." You write **one** `function*` component and register it with `defineElement()` whenever you want to expose it as a standard HTML Custom Element.

---

## 1. Write Once, Mount Anywhere

```tsx
import { defineElement, css, type Ctx } from '@fierst/aster';

export function* Counter(
  props: { start?: number; label?: string },
  ctx: Ctx<{ start?: number; label?: string }>,
) {
  let count = props.start ?? 0;
  for (props of ctx) {
    yield (
      <button onClick={() => count++}>
        {props.label ?? 'Clicks'}: {count}
      </button>
    );
  }
}

defineElement('aster-counter', Counter, {
  props: { start: 'number', label: 'string' },
  shadow: true,
  styles: css`
    button {
      padding: 0.5rem 1rem;
      border-radius: 999px;
      background: #0071e3;
      color: white;
      border: none;
      cursor: pointer;
    }
  `,
});
```

### What `defineElement()` Handles Automatically

- **Typed Attribute Coercion:** Declaring `{ start: 'number', open: 'boolean', config: 'json' }` parses HTML string attributes before passing them into `Counter`—your component never writes `Number(props.start)`.
- **JS Property Sync:** Setting `el.label = 'Score'` in JavaScript or `el.setAttribute('label', 'Score')` in HTML both push fresh props into `for (props of ctx)`.
- **Automatic Cleanup:** `disconnectedCallback()` calls `gen.return()` and aborts `ctx.signal`, executing your component's `try / finally` block cleanly.
- **Shared Signals Work Across Shadow Boundaries:** If `Counter` reads a shared `signal()`, updating that signal wakes up both `<Counter />` and `<aster-counter>` simultaneously.

---

## 2. Styling: `@scope` vs. Shadow DOM

- **Light DOM (`scope`):** Ideal for app-level UI where global typography and CSS custom properties (`--surface`, `--text`) should cascade naturally while preventing component classes from leaking out.
  ```tsx
  import { scope } from '@fierst/aster';

  const cardClass = scope`
    :scope { padding: 1.25rem; border-radius: 14px; border: 1px solid var(--border); }
    h3 { margin: 0 0 0.5rem; }
  `;

  export function Card({ title, children }: any) {
    return (
      <section class={cardClass}>
        <h3>{title}</h3>
        {children}
      </section>
    );
  }
  ```
- **Shadow DOM (`css` or CSS Module Scripts):** Ideal for portable Web Components (`defineElement(..., { shadow: true, styles })`) where strict style encapsulation is desired.
