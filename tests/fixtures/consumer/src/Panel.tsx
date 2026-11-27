import { render, type Ctx, type View } from '@fierst/aster';
import { useParams } from '@fierst/aster/router';

export function* NativeForm() {
  const defaults: Record<string, string> = { value: 'spread' };
  let _v = 'initial';
  let submissions = 0;
  for (;;)
    yield (
      <form
        action="/submitted"
        target="result"
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Escape') (e.currentTarget as HTMLElement).dataset.escape = 'yes';
        }}
        onSubmit={(event: SubmitEvent) => {
          const form = event.currentTarget as HTMLFormElement;
          form.dataset.submissions = String(++submissions);
          form.dataset.submitter = event.submitter?.id;
          form.dataset.draft = _v;
          if (_v === 'cancel') event.preventDefault();
        }}
      >
        <input name="draft" bind:value={_v} />
        <input name="first" type="hidden" value="literal" {...defaults} />
        <input name="last" type="hidden" {...defaults} value="literal" />
        <button id="save" name="intent" value="save">
          Save
        </button>
      </form>
    );
}

export function mountNativeForm() {
  return render(<NativeForm />, document.getElementById('app')!);
}

export const activate = (event: MouseEvent = new MouseEvent('click')) => {
  (event.currentTarget as HTMLButtonElement).textContent = 'Exported callback ran';
};

export { ListComponent as List };
function* ListComponent() {
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

export function Composition({ label }: { label: string }) {
  let clicks = 0;
  const update = (event: MouseEvent) => {
    (event.currentTarget as HTMLButtonElement).textContent = label + ' ' + ++clicks;
  };
  return (
    <Panel label="Wrapper">
      <button onClick={update}>Captured callback</button>
    </Panel>
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
