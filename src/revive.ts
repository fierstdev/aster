// Aster Event-Delegated Lazy Revival Loader (~520 B gzipped)
// Zero framework JS runs on page load unless an island opts in with `data-aster-eager`.
// Wakes up only the interacted island, claims existing SSR DOM in-place, preserves input, and replays the event.

export function installRevival(runtimeUrl = '@fierst/aster'): void {
  const revived = new WeakSet<Element>();
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

  const reviveIsland = async (island: Element, replayEvent?: Event, target?: Element | null) => {
    if (revived.has(island)) return;
    revived.add(island);

    const spec = island.getAttribute('data-aster-src')!;
    const [url, exportName = 'default'] = spec.split('#');
    const rawProps = island.getAttribute('data-aster-props');
    const props = rawProps ? JSON.parse(rawProps) : {};

    const [rt, mod] = await Promise.all([import(runtimeUrl), import(url)]);
    const Component = mod[exportName];
    if (typeof Component === 'function') {
      rt.claim(Component, props, island);
      if (replayEvent && target) {
        target.dispatchEvent(new (replayEvent.constructor as any)(replayEvent.type, replayEvent));
      }
    }
  };

  const wake = async (e: Event) => {
    const target = e.target as Element | null;
    const island = target?.closest?.('[data-aster-src]');
    if (!island || revived.has(island)) return;

    // Prevent default synchronously on form submit so async import() doesn't miss it
    if (e.type === 'submit') e.preventDefault();
    await reviveIsland(island, e, target);
  };

  for (const ev of ['pointerenter', 'focusin']) {
    document.addEventListener(ev, (e) => preload(e.target as Element), true);
  }
  for (const ev of ['click', 'input', 'change', 'submit']) {
    document.addEventListener(ev, wake, true);
  }

  // Eagerly boot islands explicitly annotated with `data-aster-eager` (e.g. live WebSocket tickers)
  const bootEager = () => {
    for (const el of document.querySelectorAll('[data-aster-src][data-aster-eager]')) {
      reviveIsland(el);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootEager, { once: true });
  } else {
    bootEager();
  }
}
