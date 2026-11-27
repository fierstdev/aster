import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, preview } from 'vite-plus';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  for (const variant of ['baseline', 'oxc']) {
    process.env.ASTER_EXPERIMENT_OXC = variant === 'oxc' ? '1' : '0';
    const outDir = await mkdtemp(join(tmpdir(), 'aster-oxc-'));
    try {
      const config = { configFile: 'vite.config.ts', logLevel: 'error', build: { outDir } };
      const bundle = await build(config);
      const learn = bundle.output.find(
        (chunk) =>
          chunk.type === 'chunk' &&
          Object.keys(chunk.modules).some((id) => id.endsWith('/playground/sandbox.ts')),
      );
      const server = await preview({
        ...config,
        preview: { host: '127.0.0.1', port: 0, open: false },
      });
      try {
        const samples = [];
        for (let i = 0; i < 6; i++) {
          const page = await browser.newPage();
          try {
            await page.goto(server.resolvedUrls.local[0] + 'learn');
            const counter = page.locator('.preview-stage button').first();
            await counter.waitFor();
            const ready = await page.evaluate(() => performance.now());
            await counter.click();
            assert.match(await counter.innerText(), /1/);
            await page
              .locator('.code-editor')
              .fill('function* App() { yield <p>Edited live</p>; }');
            await page.getByText('Edited live', { exact: true }).waitFor();
            if (i) samples.push(ready);
          } finally {
            await page.close();
          }
        }
        console.log(variant, {
          learnChunkGzipBytes: gzipSync(learn.code).length,
          medianObservedReadyMs: samples.sort((a, b) => a - b)[2],
        });
      } finally {
        await server.close();
      }
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
}
