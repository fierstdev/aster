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
import { compileJSX } from './compiler.ts';
import { parseModule } from 'meriyah';
import { SlotEmitter } from '../src/compiler.ts';

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

/** Compile the editor source for display without running it. */
export function compileLesson(source: string): string {
  return compileJSX(source, {
    runtimeImport: '@fierst/aster',
    moduleUrl: '/learn/App.jsx',
  });
}

export function compileSandboxCode(source: string): SandboxCompileOutput {
  const compiled = compileLesson(source);
  const imports: string[] = [];
  const body: string[] = [];
  let entry = 'App';
  const keys = Object.keys(RUNTIME_SCOPE);
  // Adapt only top-level module declarations. Strings, templates, and component bodies
  // must execute exactly as they appear in the Compiled Slots pane.
  for (const stmt of parseModule(compiled, { ranges: true, preserveParens: true }).body) {
    if (stmt.type === 'ImportDeclaration') {
      if (stmt.source.value !== '@fierst/aster')
        throw new SyntaxError('The lesson preview supports imports from @fierst/aster only.');
      for (const spec of stmt.specifiers) {
        if (spec.type !== 'ImportSpecifier')
          throw new SyntaxError('Use named Aster imports in the lesson preview.');
        const name = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
        const index = keys.indexOf(name);
        if (index === -1)
          throw new SyntaxError(`The lesson preview does not provide the Aster export "${name}".`);
        imports.push(`const ${spec.local.name} = arguments[${index}];`);
      }
    } else if (stmt.type === 'ExportDefaultDeclaration') {
      const decl = stmt.declaration;
      const text = compiled.slice(decl.start, decl.end);
      if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id) {
        entry = decl.id.name;
        body.push(text);
      } else {
        entry = new SlotEmitter(compiled).local('_default');
        body.push(`const ${entry} = (${text});`);
      }
    } else if (stmt.type === 'ExportNamedDeclaration' && !stmt.source) {
      if (stmt.declaration) body.push(compiled.slice(stmt.declaration.start, stmt.declaration.end));
      for (const spec of stmt.specifiers) {
        const exported =
          spec.exported.type === 'Identifier' ? spec.exported.name : spec.exported.value;
        if (exported === 'default' && spec.local.type === 'Identifier') entry = spec.local.name;
      }
    } else if (stmt.type === 'ExportAllDeclaration' || stmt.type === 'ExportNamedDeclaration') {
      throw new SyntaxError('The lesson preview cannot load re-exports from other modules.');
    } else body.push(compiled.slice(stmt.start, stmt.end));
  }
  return {
    compiled,
    executableBody: [
      '{',
      ...imports,
      body.join('\n;\n'),
      `return typeof ${entry} === 'function' ? ${entry} : null;`,
      '}',
    ].join('\n'),
  };
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
        error: 'Define an App component or export a component as default to preview it.',
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
