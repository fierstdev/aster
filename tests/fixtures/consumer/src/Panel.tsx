import type { Ctx, View } from '@fierst/aster';

export function* Panel(
  props: { label: string; children?: View; caption?: View },
  ctx: Ctx<typeof props>,
) {
  let count = 0;
  for (props of ctx) {
    yield (
      <section>
        <button onClick={() => count++}>
          {props.label} {count}
        </button>
        {props.caption}
        {props.children}
      </section>
    );
  }
}
