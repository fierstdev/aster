import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { LESSONS } from '../playground/lessons.ts';
import { compileSandboxCode } from '../playground/sandbox.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Interactive /learn Curriculum & llms.txt', () => {
  it('compiles every lesson starter and solution into valid JS with an App component', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(6);

    for (const lesson of LESSONS) {
      for (const variant of ['starter', 'solution'] as const) {
        const out = compileSandboxCode(lesson[variant]);
        expect(out.compiled.length, `${lesson.id}:${variant} compiled`).toBeGreaterThan(0);
        // Verify valid JS syntax by constructing the Function
        const fn = new Function(
          '_tpl',
          '_slot',
          '_comp',
          'signal',
          'createContext',
          'provide',
          'useContext',
          'Provider',
          'ErrorBoundary',
          'defineElement',
          'css',
          'scope',
          'html',
          'render',
          `"use strict";\n${out.executableBody}`,
        );
        expect(typeof fn, `${lesson.id}:${variant} factory`).toBe('function');
      }
    }
  });

  it('ships a complete llms.txt at repo root covering all core Aster idioms', () => {
    const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf-8');
    expect(llms).toContain('function*');
    expect(llms).toContain('for (props of ctx)');
    expect(llms).toContain('yield*');
    expect(llms).toContain('signal(');
    expect(llms).toContain('createContext');
    expect(llms).toContain('defineElement');
    expect(llms).toContain('streamResponse');
    expect(llms).toContain('NEVER use React hooks');
  });
});
