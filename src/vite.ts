// Aster — First-Class Vite+ (`vp`) / Rolldown Plugin
// 1. Parse original JSX/TSX with Oxc before Vite's language transforms.
// 2. Lower JSX into hoisted `_tpl()` / `_slot()` / `_comp()` calls and a V3 source map.
// 3. Injects in-place HMR (`__asterHmrAccept`) during `vp dev`.
// 4. Emits preserved island chunks & `aster-manifest.json` during `vp build` so production
//    SSR Lazy Revival resolves directly to real content-hashed Rolldown bundle URLs!

import type { CompileOptions } from './compiler.ts';
import { compileModule } from './compiler-oxc.ts';

export type FilterPattern = string | RegExp;

export interface AsterPluginOptions extends Omit<
  CompileOptions,
  'moduleUrl' | 'hmr' | 'sourceFile'
> {
  /** File extensions or path patterns to transform (default: ['.tsx', '.jsx']) */
  include?: readonly FilterPattern[];
  /** Optional path patterns to skip (useful in multi-framework Astro projects) */
  exclude?: readonly FilterPattern[];
  /** Manifest filename emitted on client builds (default: 'aster-manifest.json') */
  manifestFile?: string;
}

function matchesPattern(id: string, pattern: FilterPattern): boolean {
  if (pattern instanceof RegExp) return pattern.test(id);
  if (pattern.startsWith('.')) return id.endsWith(pattern);
  if (pattern.includes('*')) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '\0DS\0')
      .replace(/\*\*/g, '\0D\0')
      .replace(/\*/g, '[^/]*')
      .replace(/\0DS\0/g, '(?:.*/)?')
      .replace(/\0D\0/g, '.*');
    return new RegExp(`${escaped}$`).test(id);
  }
  return id.includes(pattern);
}

export function aster(options: AsterPluginOptions = {}) {
  const include = options.include ?? ['.tsx', '.jsx'];
  const exclude = options.exclude ?? [];
  const manifestFile = options.manifestFile ?? 'aster-manifest.json';
  let rootDir = '';
  let base = '/';
  let isBuild = false;
  let isSsrBuild = false;
  const clientEntries = new Map<string, string>();
  const virtualPrefix = '\0aster:client:';
  const islandModules = new Map<string, string>(); // absId -> canonical relPath ("/src/Counter.tsx")

  function toRelPath(absId: string): string {
    let rel = absId;
    if (rootDir && rel.startsWith(rootDir)) {
      rel = rel.slice(rootDir.length);
    }
    return rel.startsWith('/') ? rel : '/' + rel;
  }

  return {
    name: 'aster',
    enforce: 'pre' as const,
    // Vite handles remaining TypeScript after Aster emits the slots.
    config() {
      return {
        oxc: {
          jsx: 'preserve' as const,
        },
      };
    },
    configResolved(config: {
      root?: string;
      base?: string;
      command?: string;
      build?: { ssr?: unknown };
    }) {
      rootDir = (config.root ?? '').replace(/\\/g, '/').replace(/\/$/, '');
      base = config.base ?? '/';
      isBuild = config.command === 'build';
      isSsrBuild = Boolean(config.build?.ssr);
    },
    resolveId(id: string) {
      if (id.startsWith(virtualPrefix)) return id;
    },
    load(id: string) {
      if (id === virtualPrefix + 'runtime') {
        return `export { claim, _decodeIslandValue } from ${JSON.stringify(options.runtimeImport ?? '@fierst/aster')};`;
      }
      if (id === virtualPrefix + 'revive')
        return "export { installRevival } from '@fierst/aster/revive';";
    },
    buildStart(this: any) {
      islandModules.clear();
      clientEntries.clear();
      if (!isBuild || isSsrBuild) return;
      for (const [name, specifier] of [
        ['runtime', '@fierst/aster'],
        ['revive', '@fierst/aster/revive'],
      ]) {
        const ref = this.emitFile({
          type: 'chunk',
          id: virtualPrefix + name,
          name: 'aster-' + name,
          preserveSignature: 'strict',
        });
        clientEntries.set(specifier, ref);
      }
    },
    transform(this: any, code: string, id: string) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!include.some((pat) => matchesPattern(cleanId, pat))) return null;
      if (exclude.some((pat) => matchesPattern(cleanId, pat))) return null;

      const relPath = toRelPath(cleanId);
      const result = compileModule(code, {
        runtimeImport: options.runtimeImport ?? '@fierst/aster',
        moduleUrl: relPath,
        sourceFile: relPath,
        hmr: !isBuild,
      });

      // On client production builds, register island modules as preserved chunks so
      // Rolldown emits real hashed chunks with exports intact for Lazy Revival import()
      if (
        isBuild &&
        !isSsrBuild &&
        (result.exportedGenerators.length ||
          result.exportedStateless.length ||
          result.exportedCallbacks.length)
      ) {
        islandModules.set(cleanId, relPath);
        if (typeof this?.emitFile === 'function') {
          this.emitFile({
            type: 'chunk',
            id: cleanId,
            preserveSignature: 'allow-extension',
          });
        }
      }

      return { code: result.code, map: result.map };
    },
    generateBundle(this: any, _outputOptions: any, bundle: Record<string, any>) {
      if (!isBuild || isSsrBuild) return;

      const cleanBase = base.endsWith('/') ? base : base + '/';
      const manifest: Record<string, string> = {};
      for (const [specifier, ref] of clientEntries) {
        manifest[specifier] = cleanBase + this.getFileName(ref);
      }

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const facade = chunk.facadeModuleId?.replace(/\\/g, '/');
        if (facade && islandModules.has(facade)) {
          manifest[islandModules.get(facade)!] = `${cleanBase}${chunk.fileName}`;
          continue;
        }
        for (const modId of Object.keys(chunk.modules ?? {})) {
          const norm = modId.replace(/\\/g, '/');
          if (islandModules.has(norm) && !(islandModules.get(norm)! in manifest)) {
            manifest[islandModules.get(norm)!] = `${cleanBase}${chunk.fileName}`;
          }
        }
      }

      if (typeof this?.emitFile === 'function') {
        this.emitFile({
          type: 'asset',
          fileName: manifestFile,
          source: JSON.stringify(manifest, null, 2) + '\n',
        });
      }
    },
  };
}

export default aster;
