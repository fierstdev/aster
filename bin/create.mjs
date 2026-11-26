#!/usr/bin/env node
// Aster Project Scaffolder — Zero external dependencies.
// Usage:
//   vp dlx @fierst/aster my-app
//   npx @fierst/aster my-app
//   node bin/create.mjs my-app

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(BIN_DIR, '../template');

export function scaffoldProject(targetName, cwd = process.cwd(), options = {}) {
  const cleanName = (targetName || 'my-aster-app').trim();
  const targetDir = path.resolve(cwd, cleanName);
  const pkgName =
    path
      .basename(targetDir)
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-') || 'my-aster-app';

  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0 && !options.force) {
    throw new Error(
      `Target directory "${cleanName}" already exists and is not empty. Use --force to overwrite.`,
    );
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const created = [];

  const copyDir = (srcDir, destDir) => {
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const from = path.join(srcDir, entry.name);
      const to = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        copyDir(from, to);
      } else {
        const raw = fs.readFileSync(from, 'utf-8');
        const rendered = raw.replaceAll('__APP_NAME__', pkgName);
        fs.writeFileSync(to, rendered, 'utf-8');
        created.push(path.relative(targetDir, to).replace(/\\/g, '/'));
      }
    }
  };

  copyDir(TEMPLATE_DIR, targetDir);
  return { targetDir, pkgName, created };
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return (
      fs.realpathSync.native(process.argv[1]) ===
      fs.realpathSync.native(fileURLToPath(import.meta.url))
    );
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
})();

if (isMain) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const name = args.find((a) => !a.startsWith('-')) || 'my-aster-app';

  try {
    const res = scaffoldProject(name, process.cwd(), { force });
    console.log(`\nCreated Aster app "${res.pkgName}" in ${res.targetDir}\n`);
    for (const f of res.created) console.log(`  + ${f}`);
    console.log(`\nNext steps:\n  cd ${name}\n  vp install\n  vp dev\n`);
  } catch (err) {
    console.error(`[create-aster] ${err.message}`);
    process.exit(1);
  }
}
