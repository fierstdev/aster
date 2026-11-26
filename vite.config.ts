import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';
import aster from './src/vite.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [aster()],

  resolve: {
    alias: {
      '@fierst/aster/jsx-runtime': resolve(rootDir, 'src/jsx-runtime.ts'),
      '@fierst/aster/router': resolve(rootDir, 'src/router.ts'),
      '@fierst/aster/ssr': resolve(rootDir, 'src/ssr.ts'),
      '@fierst/aster/revive': resolve(rootDir, 'src/revive.ts'),
      '@fierst/aster/vite': resolve(rootDir, 'src/vite.ts'),
      '@fierst/aster/astro/server': resolve(rootDir, 'src/astro/server.ts'),
      '@fierst/aster/astro/client': resolve(rootDir, 'src/astro/client.ts'),
      '@fierst/aster/astro': resolve(rootDir, 'src/astro/index.ts'),
      '@fierst/aster': resolve(rootDir, 'src/index.ts'),
    },
  },

  // Library packaging (`vp pack` -> tsdown)
  pack: {
    entry: [
      'src/index.ts',
      'src/jsx-runtime.ts',
      'src/router.ts',
      'src/ssr.ts',
      'src/revive.ts',
      'src/vite.ts',
      'src/astro/index.ts',
      'src/astro/server.ts',
      'src/astro/client.ts',
    ],
    format: ['esm'],
    dts: true,
    clean: true,
  },

  // Vitest (`vp test` runs both Node unit tests and real-Chromium Browser Mode tests)
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.{ts,tsx}'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },

  // Oxlint + TypeScript 7 type-aware checks (`vp check` / `vp lint`)
  lint: {
    ignorePatterns: ['dist/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },

  // Oxfmt (`vp fmt` / `vp check`)
  fmt: {
    ignorePatterns: ['dist/**'],
    singleQuote: true,
    semi: true,
  },

  // Pre-commit checks (`vp staged`)
  staged: {
    '*': 'vp check --fix',
  },
});
