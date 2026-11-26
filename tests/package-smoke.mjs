import assert from 'node:assert/strict';
import { execFileSync, fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const repo = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-release-'));
const app = path.join(temp, 'consumer');
const npm = process.env.npm_execpath;
assert(npm, 'Run this test with npm run test:package');

function run(cwd, script, ...args) {
  execFileSync(process.execPath, [script, ...args], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  });
}

// Only files in the current build output are served by the loopback smoke-test server.
async function serve(dir, check, documentHtml) {
  const assets = new Map();
  for (const file of fs.readdirSync(dir, { recursive: true })) {
    const filename = path.join(dir, file);
    if (fs.statSync(filename).isFile()) assets.set('/' + file.split(path.sep).join('/'), filename);
  }
  const server = http.createServer((req, res) => {
    let url = new URL(req.url, 'http://localhost').pathname;
    if (url === '/ssr' && documentHtml) {
      res.setHeader('Content-Type', 'text/html');
      res.end(documentHtml);
      return;
    }
    if (url.endsWith('/')) url += 'index.html';
    const file = assets.get(url);
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    const types = {
      '.js': 'text/javascript',
      '.mjs': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
    };
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve, reject) =>
    server.once('error', reject).listen(0, '127.0.0.1', resolve),
  );
  try {
    await check('http://127.0.0.1:' + server.address().port);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

try {
  const packed = JSON.parse(
    execFileSync(process.execPath, [npm, 'pack', '--json', '--pack-destination', temp], {
      cwd: repo,
      encoding: 'utf8',
    }),
  )[0];
  const bootstrap = path.join(temp, 'bootstrap');
  fs.mkdirSync(bootstrap);
  run(
    bootstrap,
    npm,
    'install',
    '--no-audit',
    '--no-fund',
    '--prefix',
    bootstrap,
    path.join(temp, packed.filename),
  );
  run(bootstrap, 'node_modules/@fierst/aster/bin/create.mjs', app);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).dependencies[
      '@fierst/aster'
    ],
    '^' + packed.version,
  );
  run(
    app,
    npm,
    'install',
    '--no-audit',
    '--no-fund',
    path.join(temp, packed.filename),
    'astro@7.4.13',
  );
  const bin = (name, cli) => path.join(app, 'node_modules', name, cli);
  const vp = bin('vite-plus', 'bin/vp');
  run(app, vp, 'check');
  // Include an SSR island in the client graph without mounting it in the scaffolded app.
  fs.cpSync(path.join(repo, 'tests/fixtures/consumer'), app, { recursive: true });
  fs.appendFileSync(path.join(app, 'src/main.tsx'), "\nimport './Panel';\n");
  run(app, vp, 'build');
  run(app, vp, 'build', '--ssr', 'src/server.tsx', '--outDir', 'dist-server');
  const dist = path.join(app, 'dist');
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'aster-manifest.json'), 'utf8'));
  const { page: renderPage } = await import(
    pathToFileURL(path.join(app, 'dist-server/server.js')).href
  );
  const html = renderPage(manifest);
  assert.match(html, /data-aster-src="\/assets\/[^"]+#Panel"/);
  const astroPkg = JSON.parse(fs.readFileSync(bin('astro', 'package.json'), 'utf8'));
  run(
    app,
    bin('astro', typeof astroPkg.bin === 'string' ? astroPkg.bin : astroPkg.bin.astro),
    'build',
  );
  for (const engine of [chromium, firefox, webkit]) {
    console.log('Checking ' + engine.name());
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', (e) => {
        errors.push(e.message);
        console.error(e);
      });
      await page.addInitScript(() =>
        document.addEventListener('aster:revival-error', (e) => console.error(String(e.detail))),
      );
      page.on('console', (msg) => {
        if (msg.type() === 'error') console.error(msg.text());
      });
      const dev = fork(path.join(app, 'dev.mjs'), { cwd: app });
      const stopped = once(dev, 'exit');
      try {
        const origin = await Promise.race([
          once(dev, 'message').then(([url]) => url),
          stopped.then(() => {
            throw new Error('Development server exited before startup');
          }),
        ]);
        await page.goto(origin);
        await page.getByRole('button', { name: 'Clicks: 0' }).click();
        await page.getByRole('button', { name: 'Clicks: 1' }).waitFor();
        await page.goto('about:blank');
      } finally {
        dev.kill();
        await stopped;
      }
      await serve(
        dist,
        async (origin) => {
          await page.goto(origin);
          await page.getByRole('button', { name: 'Clicks: 0' }).click();
          await page.getByRole('button', { name: 'Clicks: 1' }).waitFor();
          await page.goto(origin + '/ssr');
          await page.getByRole('button', { name: 'SSR 0' }).click();
          await page.getByRole('button', { name: 'SSR 1' }).waitFor();
          await page.getByText('Child label', { exact: false }).last().waitFor();
          const row = await page.getByRole('button', { name: 'List 0' }).elementHandle();
          await page.getByRole('button', { name: 'List 0' }).click();
          await page.getByRole('button', { name: 'List 1' }).waitFor();
          assert(await row.evaluate((el) => el.isConnected));
          const checkbox = page.getByRole('checkbox');
          await checkbox.click();
          await page.getByText('true', { exact: true }).waitFor();
          assert(await checkbox.isChecked());
          await page.getByRole('button', { name: 'one info 0' }).click();
          await page.getByRole('button', { name: 'one info 1' }).waitFor();
        },
        html,
      );
      await serve(path.join(app, 'astro-dist'), async (origin) => {
        await page.goto(origin);
        await page.locator('astro-island:not([ssr])').first().waitFor();
        for (const label of ['Visible', 'Client']) {
          await page
            .locator('astro-island:not([ssr])')
            .getByRole('button', { name: label + ' 0' })
            .click();
          await page.getByRole('button', { name: label + ' 1' }).waitFor();
        }
        await page.getByText('Named slot').waitFor();
        await page.getByText('Default slot').waitFor();
        await page.getByRole('link', { name: 'Other page' }).click();
        await page.getByRole('link', { name: 'Return' }).click();
        await page.getByRole('button', { name: 'Visible 0' }).waitFor();
      });
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  }
  console.log('Packed consumer, SSR revival, and Astro smoke tests passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
