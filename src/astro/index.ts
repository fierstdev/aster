// Aster Astro Integration (`@fierst/aster/astro`)
// Registers Aster's server & client renderers and wires `@fierst/aster/vite` into Astro's Vite pipeline.
//
// Usage in `astro.config.mjs`:
//   import { defineConfig } from 'astro/config';
//   import aster from '@fierst/aster/astro';
//
//   export default defineConfig({
//     integrations: [aster()],
//   });

import asterVite, { type AsterPluginOptions, type FilterPattern } from '../vite.ts';

export interface AsterAstroOptions {
  /** File extensions or glob/RegExp patterns to compile with Aster (default: ['.tsx', '.jsx']) */
  include?: readonly FilterPattern[];
  /** Optional path patterns to exclude (e.g. when coexisting with @astrojs/react) */
  exclude?: readonly FilterPattern[];
  /** Override Aster runtime import specifier (default: '@fierst/aster') */
  runtimeImport?: string;
}

export interface AstroRendererConfig {
  name: string;
  clientEntrypoint: string;
  serverEntrypoint: string;
}

export interface AstroSetupContext {
  addRenderer(renderer: AstroRendererConfig): void;
  updateConfig(config: Record<string, any>): void;
}

export interface AstroIntegration {
  name: string;
  hooks: {
    'astro:config:setup'(ctx: AstroSetupContext): void;
  };
}

export function asterAstro(options: AsterAstroOptions = {}): AstroIntegration {
  const viteOpts: AsterPluginOptions = {
    include: options.include,
    exclude: options.exclude,
    runtimeImport: options.runtimeImport,
  };

  return {
    name: 'aster',
    hooks: {
      'astro:config:setup'({ addRenderer, updateConfig }) {
        addRenderer({
          name: 'aster',
          clientEntrypoint: '@fierst/aster/astro/client',
          serverEntrypoint: '@fierst/aster/astro/server',
        });

        updateConfig({
          vite: {
            plugins: [asterVite(viteOpts)],
            optimizeDeps: {
              exclude: [
                '@fierst/aster',
                '@fierst/aster/astro',
                '@fierst/aster/astro/client',
                '@fierst/aster/astro/server',
              ],
            },
          },
        });
      },
    },
  };
}

export default asterAstro;
