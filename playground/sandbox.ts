import {
  _tpl,
  _slot,
  _comp,
  signal,
  createContext,
  provide,
  useContext,
  Provider,
  ErrorBoundary,
  defineElement,
  css,
  scope,
  html,
  render,
} from '@fierst/aster';
import { compileJSX } from '../src/compiler.ts';

export interface SandboxCompileOutput {
  compiled: string;
  executableBody: string;
}

const RUNTIME_SCOPE = {
  _tpl,
  _slot,
  _comp,
  signal,
  createContext,
  provide,
  useContext,
  Provider,
  ErrorBoundary,
  defineElement,
  css,
  scope,
  html,
  render,
};

/**
 * Compile user JS+JSX from the `/learn` editor into both displayable compiled ESM
 * and a sandbox-executable function body.
 */
export function compileSandboxCode(source: string): SandboxCompileOutput {
  const compiled = compileJSX(source, {
    runtimeImport: '@fierst/aster',
    moduleUrl: '/learn/App.jsx',
  });

  // Strip ESM `import ... from '@fierst/aster'` lines (injected via RUNTIME_SCOPE)
  // and `export` keywords so the snippet runs cleanly inside `new Function`.
  const executableBody =
    compiled
      .replace(/^\s*import\s+[\s\S]*?from\s+['"]@fierst\/aster['"];?\s*$/gm, '')
      .replace(/\bexport\s+default\s+/g, '')
      .replace(/\bexport\s+(?=(?:async\s+)?function|const|let|var)/g, '') +
    '\nreturn typeof App === "function" ? App : null;\n';

  return { compiled, executableBody };
}

export interface SandboxMountResult {
  dispose: () => void;
  compiled: string;
  error: string | null;
}

/** Compile and mount a live `/learn` lesson component into `container`. */
export function mountSandbox(source: string, container: HTMLElement): SandboxMountResult {
  let compiled = '';
  try {
    const out = compileSandboxCode(source);
    compiled = out.compiled;

    const scopeKeys = Object.keys(RUNTIME_SCOPE);
    const scopeVals = Object.values(RUNTIME_SCOPE);
    const factory = new Function(...scopeKeys, `"use strict";\n${out.executableBody}`);
    const AppComp = factory(...scopeVals);

    if (typeof AppComp !== 'function') {
      return {
        dispose: () => {},
        compiled,
        error: 'Define a `function* App()` (or `function App()`) component to preview.',
      };
    }

    const dispose = render(_comp(AppComp, {}), container);
    return { dispose, compiled, error: null };
  } catch (err: any) {
    container.textContent = '';
    return {
      dispose: () => {},
      compiled,
      error: String(err?.message ?? err),
    };
  }
}
