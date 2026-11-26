import './styles.css';
import { render, type Ctx } from '@fierst/aster';

export function* Counter(props: { label?: string }, ctx: Ctx<{ label?: string }>) {
  let count = 0;

  for (props of ctx) {
    yield (
      <div class="row">
        <button class="primary" onClick={() => count++}>
          {props.label ?? 'Clicks'}: {count}
        </button>
        <button onClick={() => (count = 0)} disabled={count === 0}>
          Reset
        </button>
      </div>
    );
  }
}

function App() {
  return (
    <main>
      <h1>__APP_NAME__</h1>
      <p>
        Plain <code>let</code> state in <code>function*</code> components—powered by Aster &amp;
        Vite+.
      </p>
      <Counter label="Clicks" />
    </main>
  );
}

render(<App />, document.getElementById('app')!);
