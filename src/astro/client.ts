// Aster Astro Client Renderer (`@fierst/aster/astro/client`)
// Hydrates `<astro-island>` elements in-place using Aster's `claim()` (or fresh `render()`
// for `client:only="aster"`), and cleans up deterministically on `astro:unmount`.

import { claim, render, _comp } from '../runtime.ts';
import { mergeAstroProps } from './slots.ts';

const mountedDisposers = new WeakMap<HTMLElement, () => void>();

export interface AstroClientOptions {
  client: 'load' | 'idle' | 'visible' | 'media' | 'only' | string;
}

export default function hydrateAster(element: HTMLElement) {
  return async (
    Component: any,
    props: Record<string, any> = {},
    slots: Record<string, string> = {},
    options: AstroClientOptions = { client: 'load' },
  ): Promise<void> => {
    // Clean up any previous mount on this island element
    const prevDispose = mountedDisposers.get(element);
    if (prevDispose) {
      prevDispose();
      mountedDisposers.delete(element);
    }

    if (typeof Component !== 'function') return;

    const merged = mergeAstroProps(props, slots, true);
    let dispose: () => void;

    if (options.client === 'only' || element.childNodes.length === 0) {
      dispose = render(_comp(Component, merged), element);
    } else {
      const handle = claim(Component, merged, element);
      dispose = () => handle.dispose();
    }

    const cleanup = () => {
      const current = mountedDisposers.get(element);
      if (current === cleanup) mountedDisposers.delete(element);
      dispose();
    };

    mountedDisposers.set(element, cleanup);
    // Clean up generators (`try / finally` + `ctx.signal`) on Astro View Transition navigation
    element.addEventListener('astro:unmount', cleanup, { once: true });
  };
}
