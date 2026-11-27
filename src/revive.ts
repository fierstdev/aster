// Aster Event-Delegated Lazy Revival Loader
// Zero framework JS runs on page load unless an island opts in with `data-aster-eager`.
// Wakes up only the interacted island, claims existing SSR DOM in-place, preserves input, and replays the event.

export function installRevival(runtimeUrl = '@fierst/aster'): () => void {
  const listeners = new AbortController();
  const revived = new Map<Element, { dispose(): void } | undefined>();
  const removed = new MutationObserver((records) => {
    if (
      !records.some((record) => Array.from(record.removedNodes).some((node) => node.nodeType === 1))
    )
      return;
    for (const [island, handle] of revived) {
      if (island.isConnected && island.ownerDocument === document) continue;
      revived.delete(island);
      handle?.dispose();
    }
    if (!revived.size) removed.disconnect();
  });
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
    const [url, exportName = 'default'] = spec.split(/#(.*)/s);
    const rawProps = island.getAttribute('data-aster-props');
    let props = rawProps ? JSON.parse(rawProps) : {};
    for (const key of JSON.parse(island.getAttribute('data-aster-query-props') ?? '[]')) {
      props[key] = new URLSearchParams(props[key]);
    }

    const [rt, mod] = await Promise.all([
      import(/* @vite-ignore */ runtimeUrl),
      import(/* @vite-ignore */ url),
    ]);
    const values = island.getAttribute('data-aster-values');
    if (values) props = await rt._decodeIslandValue(JSON.parse(values));
    if (listeners.signal.aborted || !island.isConnected) return false;
    const Component = mod[exportName];
    if (typeof Component !== 'function') throw new TypeError(`Missing component export in ${spec}`);
    const handle = rt.claim(Component, props, island);
    if (!revived.size) removed.observe(document, { childList: true, subtree: true });
    revived.set(island, handle);
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
    const node = e.target;
    const target =
      node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
    const island = target?.closest?.('[data-aster-src]');
    if (!island || revived.has(island)) return;
    const canceled = e.defaultPrevented;
    const button = target?.closest('button,input');
    const activatesForm =
      (button instanceof HTMLButtonElement || button instanceof HTMLInputElement) &&
      button.form &&
      (button.type === 'submit' || button.type === 'image');

    // A cached import can finish between capture and target listeners in WebKit.
    // Only the replay should reach the newly attached component handlers.
    e.stopImmediatePropagation();
    // Prevent default synchronously on form submit so async import() doesn't miss it
    if (
      e.type === 'submit' ||
      (e.type === 'click' &&
        (activatesForm ||
          (target instanceof HTMLInputElement &&
            (target.type === 'checkbox' || target.type === 'radio'))))
    )
      e.preventDefault();
    if (await reviveIsland(island)) {
      if (e.eventPhase !== Event.NONE) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!target || !island.isConnected || !island.contains(target)) return;
      if (
        e instanceof SubmitEvent &&
        e.isTrusted &&
        !canceled &&
        target instanceof HTMLFormElement
      ) {
        const submitter = e.submitter;
        if (
          submitter &&
          (!(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) ||
            submitter.form !== target)
        )
          return;
        HTMLFormElement.prototype.requestSubmit.call(target, submitter ?? undefined);
      } else {
        const replay = new (e.constructor as any)(e.type, e);
        if (canceled) replay.preventDefault();
        target.dispatchEvent(replay);
      }
    }
  };

  for (const ev of ['pointerenter', 'focusin']) {
    document.addEventListener(ev, (e) => preload(e.target as Element), {
      capture: true,
      signal: listeners.signal,
    });
  }
  for (const ev of ['keydown', 'click', 'input', 'change', 'submit']) {
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
