// Aster Event-Delegated Lazy Revival Loader
// Zero framework JS runs on page load unless an island opts in with `data-aster-eager`.
// Wakes up only the interacted island, claims existing SSR DOM in-place, preserves input, and replays the event.

export function installRevival(runtimeUrl = '@fierst/aster'): () => void {
  const listeners = new AbortController();
  const revived = new WeakSet<Element>();
  const loading = new WeakMap<Element, Promise<boolean>>();
  const preloaded = new Set<string>();

  const preload = (el: Element | null) => {
    const island = el?.closest?.('[data-aster-src]');
    if (!island || revived.has(island)) return;
    const src = island.getAttribute('data-aster-src')!.split('#')[0];
    if (preloaded.has(src)) return;
    preloaded.add(src);
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = src;
    document.head.appendChild(link);
  };

  const claimIsland = async (island: Element) => {
    const spec = island.getAttribute('data-aster-src')!;
    const [url, exportName = 'default'] = spec.split('#');
    const rawProps = island.getAttribute('data-aster-props');
    const props = rawProps ? JSON.parse(rawProps) : {};

    const [rt, mod] = await Promise.all([
      import(/* @vite-ignore */ runtimeUrl),
      import(/* @vite-ignore */ url),
    ]);
    if (listeners.signal.aborted) return false;
    const Component = mod[exportName];
    if (typeof Component !== 'function') throw new TypeError(`Missing component export in ${spec}`);
    rt.claim(Component, props, island);
    revived.add(island);
    return true;
  };

  const reviveIsland = (island: Element) => {
    const pending = loading.get(island);
    if (pending) return pending;
    const task = claimIsland(island)
      .finally(() => loading.delete(island))
      .catch((error: unknown) => {
        island.dispatchEvent(
          new CustomEvent('aster:revival-error', { bubbles: true, detail: error }),
        );
        return false;
      });
    loading.set(island, task);
    return task;
  };

  const wake = async (e: Event) => {
    const target = e.target as Element | null;
    const island = target?.closest?.('[data-aster-src]');
    if (!island || revived.has(island)) return;

    // Prevent default synchronously on form submit so async import() doesn't miss it
    if (e.type === 'submit') e.preventDefault();
    if (await reviveIsland(island)) {
      target?.dispatchEvent(new (e.constructor as any)(e.type, e));
    }
  };

  for (const ev of ['pointerenter', 'focusin']) {
    document.addEventListener(ev, (e) => preload(e.target as Element), {
      capture: true,
      signal: listeners.signal,
    });
  }
  for (const ev of ['click', 'input', 'change', 'submit']) {
    document.addEventListener(ev, wake, { capture: true, signal: listeners.signal });
  }

  // Eagerly boot islands explicitly annotated with `data-aster-eager` (e.g. live WebSocket tickers)
  const bootEager = () => {
    for (const el of document.querySelectorAll('[data-aster-src][data-aster-eager]')) {
      if (!revived.has(el)) void reviveIsland(el);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootEager, {
      once: true,
      signal: listeners.signal,
    });
  } else {
    bootEager();
  }
  return () => listeners.abort();
}
