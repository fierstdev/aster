import { readFile, readdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const guides = await readdir(new URL('docs/guides/', root));
const chapters = [
  ...guides
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => 'docs/guides/' + name),
  'docs/reference.md',
];
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const repository = 'https://github.com/fierstdev/aster/blob/v' + version + '/';
const sections = [
  '# Aster ' + version,
  'When writing Aster components, NEVER use React hooks. Keep local state in a generator, receive fresh props with for (props of ctx), and delegate interactive steps with yield*. DOM event handlers schedule a refresh. External subscriptions can call ctx.refresh() and use ctx.onCleanup() to unsubscribe.',
  'Aster is a browser-native UI framework. Write a function for a view derived from props, a synchronous generator for interactive local state, and a finite async generator for loading and resolved views. Use JSX with the Aster Vite plugin or tagged HTML in JavaScript.',
  'This handbook contains the complete application guides followed by the API reference. For design history, see the [architecture decisions](' +
    repository +
    'docs/README.md).',
];

for (const filename of chapters) {
  const chapter = await readFile(new URL(filename, root), 'utf8');
  sections.push(
    chapter
      .trim()
      .replace(
        /\]\((\.\.?\/[^)]+)\)/g,
        (_, path) => '](' + new URL(path, repository + filename).href + ')',
      ),
  );
}

await writeFile(new URL('llms.txt', root), sections.join('\n\n') + '\n');
