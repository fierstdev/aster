// End-to-end Vite+ TSX Integration Test
// Verifies Oxc TypeScript stripping (`oxc: { jsx: 'preserve' }`) + Aster JSX slot lowering + auto `__asterSrc`!
import { describe, expect, it } from 'vite-plus/test';
import { signal, type Ctx } from '@fierst/aster';
import { renderToString } from '@fierst/aster/ssr';

const shared = signal(2);

export function* SampleCounter(
  props: { start?: number; onDone?: (n: number) => void },
  ctx: Ctx<{ start?: number; onDone?: (n: number) => void }>,
) {
  let count: number = props.start ?? 0;
  for (props of ctx) {
    const doubled = count * shared();
    yield (
      <div class="sample">
        <button onClick={() => count++}>
          Value: {count} ({doubled})
        </button>
      </div>
    );
  }
}

export function StaticBanner({ text }: { text: string }) {
  return <header class="banner">{text}</header>;
}

describe('Vite+ Oxc + Aster TSX Pipeline', () => {
  it('auto-stamps exported function* components and leaves stateless functions unstamped', () => {
    expect((SampleCounter as any).__asterSrc).toMatch(/tsx-integration\.test\.tsx#SampleCounter$/);
    expect((StaticBanner as any).__asterSrc).toBeUndefined();
  });

  it('renders TSX components cleanly via SSR with automatic Lazy Revival markers', () => {
    const html = renderToString(
      <main>
        <StaticBanner text="Hello Aster" />
        <SampleCounter start={3} />
      </main>,
      { revive: true },
    );

    expect(html).toContain('<header class="banner">Hello Aster</header>');
    expect(html).toContain('<aster-island data-aster-src=');
    expect(html.replace(/<!--[\s\S]*?-->/g, '')).toContain('Value: 3 (6)');
  });
});
