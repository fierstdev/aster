import type { Ctx } from '@fierst/aster';

export function* Counter(props: { label?: string }, ctx: Ctx<{ label?: string }>) {
  let count = 0;

  for (props of ctx) {
    yield (
      <div class="counter-actions">
        <button class="counter-increment" onClick={() => count++}>
          {props.label ?? 'Clicks'}: {count}
        </button>
        <button onClick={() => (count = 0)} disabled={count === 0}>
          Reset
        </button>
      </div>
    );
  }
}
