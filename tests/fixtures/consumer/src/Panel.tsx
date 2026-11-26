import type { Ctx, View } from '@fierst/aster';
import { useParams } from '@fierst/aster/router';

export function* List() {
  let count = 0;
  for (;;)
    yield (
      <>
        {['A'].map((key) => (
          <button key={key} onClick={() => count++}>
            List {count}
          </button>
        ))}
      </>
    );
}

export function* Check() {
  let checked = false;
  for (;;)
    yield (
      <label>
        <input type="checkbox" bind:checked={checked} />
        <span>{String(checked)}</span>
      </label>
    );
}

export function* Routed(props: { search: URLSearchParams }) {
  let count = 0;
  for (;;)
    yield (
      <button onClick={() => count++}>
        {useParams().id} {props.search.get('tab')} {count}
      </button>
    );
}

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
