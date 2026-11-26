import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import aster from '../src/vite.ts';
import { scaffoldProject } from '../bin/create.mjs';

describe('@fierst/aster/vite Production Island Manifest & HMR', () => {
  it('emits preserved island chunks and aster-manifest.json on client build', () => {
    const plugin = aster();
    plugin.configResolved({ root: '/repo', base: '/', command: 'build', build: { ssr: false } });
    plugin.buildStart.call({ emitFile: (chunk: { name: string }) => chunk.name });

    const emittedChunks: any[] = [];
    const transformCtx = { emitFile: (f: any) => emittedChunks.push(f) };
    const transformed = plugin.transform.call(
      transformCtx,
      'export function* Counter() { let n = 0; for (;;) yield <button>{n}</button>; }',
      '/repo/src/Counter.tsx',
    );

    expect(transformed?.code).toContain('Counter.__asterSrc = "/src/Counter.tsx#Counter"');
    expect(transformed?.code).not.toContain('import.meta.hot');
    expect(transformed?.map?.version).toBe(3);
    expect(emittedChunks).toEqual([
      { type: 'chunk', id: '/repo/src/Counter.tsx', preserveSignature: 'allow-extension' },
    ]);

    const emittedAssets: any[] = [];
    const bundleCtx = {
      emitFile: (f: any) => emittedAssets.push(f),
      getFileName: (ref: string) => `assets/${ref}.js`,
    };
    plugin.generateBundle.call(
      bundleCtx,
      {},
      {
        'assets/Counter-Ab12Cd.js': {
          type: 'chunk',
          fileName: 'assets/Counter-Ab12Cd.js',
          facadeModuleId: '/repo/src/Counter.tsx',
          modules: { '/repo/src/Counter.tsx': {} },
        },
      },
    );

    expect(emittedAssets.length).toBe(1);
    expect(emittedAssets[0].fileName).toBe('aster-manifest.json');
    expect(JSON.parse(emittedAssets[0].source)).toEqual({
      '@fierst/aster': '/assets/aster-runtime.js',
      '@fierst/aster/revive': '/assets/aster-revive.js',
      '/src/Counter.tsx': '/assets/Counter-Ab12Cd.js',
    });
  });

  it('injects HMR self-accept wiring during dev serve', () => {
    const plugin = aster();
    plugin.configResolved({ root: '/repo', base: '/', command: 'serve' });
    const transformed = plugin.transform.call(
      {},
      'export function* Counter() { for (;;) yield <button>Hi</button>; }',
      '/repo/src/Counter.tsx',
    );
    expect(transformed?.code).toContain('import.meta.hot.accept');
    expect(transformed?.code).toContain('__asterHmrAccept("/src/Counter.tsx"');
  });
});

describe('create-aster Project Scaffolder', () => {
  it('scaffolds a complete Vite+ Aster project with interpolated package name', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-create-'));
    try {
      const res = scaffoldProject('demo-app', tmp);
      expect(res.pkgName).toBe('demo-app');
      expect(res.created).toContain('package.json');
      expect(res.created).toContain('vite.config.ts');
      expect(res.created).toContain('tsconfig.json');
      expect(res.created).toContain('index.html');
      expect(res.created).toContain('src/main.tsx');

      const pkg = JSON.parse(fs.readFileSync(path.join(res.targetDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('demo-app');
      expect(pkg.dependencies['@fierst/aster']).toBeTruthy();

      // Refuses to overwrite non-empty dir without --force
      expect(() => scaffoldProject('demo-app', tmp)).toThrow(/already exists/);
      // Succeeds with force: true
      expect(scaffoldProject('demo-app', tmp, { force: true }).pkgName).toBe('demo-app');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
