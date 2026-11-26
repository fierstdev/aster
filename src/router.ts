// Aster Router — Browser-Native Navigation API + URLPattern + View Transitions
// Plain `<a href="/...">` tags work natively with zero `<Link>` wrapper.
// Gracefully falls back to History API when `window.navigation` is unavailable.

import { signal, _comp, createContext, provide, useContext, type ComponentFn } from './runtime.ts';

export interface RouteDef {
  path: string;
  component: ComponentFn<any>;
}

export interface RouteMatch {
  route: RouteDef;
  params: Record<string, string>;
  search: URLSearchParams;
  pathname: string;
}

const currentUrl = signal<string>(
  typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/',
);
const currentParams = signal<Record<string, string>>({});
const routeContext = createContext<{ url: string; params: Record<string, string> } | null>(null);

export function useLocation(): string {
  return useContext(routeContext)?.url ?? currentUrl();
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return (useContext(routeContext)?.params ?? currentParams()) as T;
}

export function useSearchParams(): URLSearchParams {
  const url = useLocation();
  const q = url.indexOf('?');
  return new URLSearchParams(q === -1 ? '' : url.slice(q + 1));
}

function commitUrl(to: string, transition: boolean) {
  const apply = () => currentUrl.set(to);
  if (
    transition &&
    typeof document !== 'undefined' &&
    typeof (document as any).startViewTransition === 'function'
  ) {
    (document as any).startViewTransition(apply);
  } else {
    apply();
  }
}

export function navigate(to: string, opts: { replace?: boolean; transition?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const nav = typeof window !== 'undefined' ? (window as any).navigation : null;
  if (nav && typeof nav.navigate === 'function') {
    nav.navigate(to, { history: opts.replace ? 'replace' : 'push' });
    return;
  }
  if (typeof window !== 'undefined') {
    if (opts.replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
  }
  commitUrl(to, opts.transition ?? true);
}

/** Match a pathname + search against RouteDefs using native URLPattern (with fallback). */
export function matchRoute(routes: readonly RouteDef[], urlStr: string): RouteMatch | null {
  const parsed = new URL(urlStr, 'http://aster.local');
  const pathname = parsed.pathname;

  for (const route of routes) {
    const URLPatternCtor = (globalThis as any).URLPattern;
    if (typeof URLPatternCtor !== 'undefined') {
      const res = new URLPatternCtor({ pathname: route.path }).exec({ pathname });
      if (res) {
        const params: Record<string, string> = {};
        for (const [k, v] of Object.entries(
          res.pathname.groups as Record<string, string | undefined>,
        )) {
          if (v !== undefined) params[k] = decodeURIComponent(v);
        }
        return { route, params, search: parsed.searchParams, pathname };
      }
    } else {
      const keys: string[] = [];
      const reStr =
        '^' +
        route.path
          .replace(/\/:([^/]+)/g, (_m, k) => {
            keys.push(k);
            return '/([^/]+)';
          })
          .replace(/\*/g, '.*') +
        '$';
      const m = pathname.match(new RegExp(reStr));
      if (m) {
        const params: Record<string, string> = {};
        keys.forEach((k, i) => {
          params[k] = decodeURIComponent(m[i + 1]);
        });
        return { route, params, search: parsed.searchParams, pathname };
      }
    }
  }
  return null;
}

/**
 * Browser-Native Generator Router — works identically on Client and SSR.
 * Standard `<a href="/about">` links are intercepted automatically via the Navigation API
 * (with View Transitions when supported) and gracefully fall back to History API.
 */
export function* Router(
  props: {
    routes: readonly RouteDef[];
    url?: string;
    fallback?: ComponentFn;
    transitions?: boolean;
  },
  ctx: any,
) {
  const useTransitions = props.transitions ?? true;

  if (typeof window !== 'undefined') {
    const nav = (window as any).navigation;
    if (nav && typeof nav.addEventListener === 'function') {
      const onNavigate = (event: any) => {
        if (!event.canIntercept || event.hashChange || event.downloadRequest || event.formData)
          return;
        const dest = new URL(event.destination.url);
        if (dest.origin !== window.location.origin) return;
        const nextUrl = dest.pathname + dest.search;
        event.intercept({
          handler() {
            commitUrl(nextUrl, useTransitions);
          },
        });
      };
      nav.addEventListener('navigate', onNavigate);
      ctx.onCleanup(() => nav.removeEventListener('navigate', onNavigate));
    } else {
      // Fallback for browsers without Navigation API
      const onPop = () =>
        commitUrl(window.location.pathname + window.location.search, useTransitions);
      const onClick = (e: MouseEvent) => {
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        )
          return;
        const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!a || a.target || a.hasAttribute('download') || a.hasAttribute('data-aster-reload'))
          return;
        const href = a.getAttribute('href')!;
        if (!href.startsWith('/') || href.startsWith('//')) return;
        e.preventDefault();
        navigate(href, { transition: useTransitions });
      };
      window.addEventListener('popstate', onPop);
      document.addEventListener('click', onClick);
      ctx.onCleanup(() => {
        window.removeEventListener('popstate', onPop);
        document.removeEventListener('click', onClick);
      });
    }
  }

  for (props of ctx) {
    const activeUrl = props.url ?? currentUrl();
    const matched = matchRoute(props.routes, activeUrl);
    const params = matched?.params ?? {};
    provide(routeContext, { url: activeUrl, params });
    if (typeof window !== 'undefined') currentParams.set(params);
    if (matched) {
      yield _comp(
        matched.route.component,
        { params: matched.params, search: matched.search, pathname: matched.pathname },
        matched.route.path,
      );
    } else if (props.fallback) {
      yield _comp(props.fallback, { pathname: activeUrl });
    } else {
      yield null;
    }
  }
}
