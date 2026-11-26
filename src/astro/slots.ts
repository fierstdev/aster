// Aster Astro Renderer — Shared Slot Bridge
// Wraps Astro's pre-rendered HTML slot strings into Aster static SlotViews
// (`<astro-slot>` / `<astro-slot name="...">`) so SSR never double-escapes Astro HTML
// and client hydration preserves slotted markup cleanly.

import { _slot, _tpl, type SlotView } from '../runtime.ts';

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function createAstroSlotView(name: string, html: string, staticSlot = true): SlotView {
  if (!staticSlot) {
    return _slot(_tpl(html, []), []);
  }
  const tag =
    name === 'default'
      ? `<astro-slot>${html}</astro-slot>`
      : `<astro-slot name="${escapeAttr(name)}">${html}</astro-slot>`;
  return _slot(_tpl(tag, []), []);
}

export function mergeAstroProps(
  props: Record<string, any> | undefined,
  slots: Record<string, string> | undefined,
  staticSlot = true,
): Record<string, any> {
  const merged: Record<string, any> = { ...props };
  if (!slots) return merged;

  for (const [name, html] of Object.entries(slots)) {
    if (html == null) continue;
    if (name === 'default') {
      merged.children = createAstroSlotView('default', html, staticSlot);
    } else {
      merged[name] = createAstroSlotView(name, html, staticSlot);
    }
  }
  return merged;
}
