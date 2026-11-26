import { defineConfig } from 'astro/config';
import aster from '@fierst/aster/astro';

export default defineConfig({ integrations: [aster()], outDir: './astro-dist' });
