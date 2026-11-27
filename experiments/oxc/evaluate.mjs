import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SourceMap } from 'node:module';
import { performance } from 'node:perf_hooks';
import { build, createServer, parseSync } from 'vite-plus';
import { compileModule } from '../../src/compiler.ts';
import { LESSONS } from '../../playground/lessons.ts';
import { compileOxc } from './compiler.mjs';

const samples = LESSONS.flatMap((lesson) => [lesson.starter, lesson.solution]);
const options = { moduleUrl: '/sample.jsx', hmr: true };
const compilerTests = readFileSync('tests/compiler.test.ts', 'utf8');
const ast = parseSync('tests.ts', compilerTests).program;
function collectFixtures(node) {
  if (
    node?.type === 'CallExpression' &&
    ['compileJSX', 'compileModule'].includes(node.callee.name)
  ) {
    const arg = node.arguments[0];
    if (arg.type === 'TemplateLiteral' && !arg.expressions.length)
      samples.push(arg.quasis[0].value.cooked);
  }
  if (!node?.type) return;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(collectFixtures);
    else if (value?.type) collectFixtures(value);
  }
}
collectFixtures(ast);
let compatible = 0,
  rejected = 0;
for (const source of samples) {
  const baseline = compileModule(source, options);
  if (source.includes('{/* tag comment */}')) {
    assert.throws(() => compileOxc(source, options), SyntaxError);
    rejected++;
    continue;
  }
  const candidate = compileOxc(source, options);
  assert.equal(candidate.code, baseline.code);
  compatible++;
}
console.log({ identicalOutputs: compatible, rejectedOpeningTagComment: rejected });

const nested = 'export const Save = (label = getLabel()) => <button>{label}</button>';
assert.deepEqual(compileModule(nested, options).exportedStateless, []);
assert.deepEqual(compileOxc(nested, options).exportedStateless, ['Save']);
assert.ok(compileOxc(nested, options).code.includes('Save.__asterOwnerSrc'));

const variants = ['baseline', 'oxc'];
const fixture = '/tests/fixtures/oxc/map-fixture.tsx';
const original = readFileSync('.' + fixture, 'utf8');
for (const variant of variants) {
  process.env.ASTER_EXPERIMENT_OXC = variant === 'oxc' ? '1' : '0';
  const server = await createServer({
    configFile: 'vite.config.ts',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
  });
  try {
    const result = await server.transformRequest(fixture);
    const map = new SourceMap(result.map);
    for (const token of ['props.label', 'props.count']) {
      const lines = result.code.split('\n');
      const line = lines.findIndex((value) => value.includes(token));
      const entry = map.findEntry(line, lines[line].indexOf(token));
      const expected = original.split('\n')[1].indexOf(token);
      console.log(variant, token, {
        mappedLine: entry.originalLine,
        mappedColumn: entry.originalColumn,
        expectedColumn: expected,
      });
      if (variant === 'oxc') {
        assert.equal(entry.originalLine, 1);
        assert.equal(entry.originalColumn, expected);
        assert.equal(new URL(entry.originalSource, 'file://' + fixture).pathname, fixture);
        assert.equal(result.map.sourcesContent[0], original);
      }
    }
  } finally {
    await server.close();
  }
}

// Alternate order and drop one warm-up for each full production build.
const durations = [[], []];
for (let round = 0; round < 9; round++) {
  for (const index of round % 2 ? [1, 0] : [0, 1]) {
    process.env.ASTER_EXPERIMENT_OXC = String(index);
    const start = performance.now();
    await build({ configFile: 'vite.config.ts', logLevel: 'error', build: { write: false } });
    if (round) durations[index].push(performance.now() - start);
  }
}
for (const [i, times] of durations.entries()) {
  const sorted = times.sort((a, b) => a - b);
  console.log(variants[i], 'warm build ms', {
    median: (sorted[3] + sorted[4]) / 2,
    min: sorted[0],
    max: sorted.at(-1),
  });
}
