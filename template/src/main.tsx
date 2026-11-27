import './styles.css';
import { render } from '@fierst/aster';
import { Counter } from './counter';

// Include optional AsterUI tokens in the first stylesheet, even for lazy components.
import.meta.glob('./ui/theme.css', { eager: true });

function App() {
  return (
    <main class="starter">
      <header class="masthead">
        <strong>Aster</strong>
        <code>__APP_NAME__</code>
      </header>
      <section class="welcome">
        <h1>Make your first edit.</h1>
        <p>
          Open <code>src/main.tsx</code> and change this heading. Save the file to see your change
          in the browser.
        </p>
      </section>
      <section class="demo">
        <div>
          <h2>Try a generator component</h2>
          <p>
            Click to update local state. Open <code>src/counter.tsx</code> to see how it works.
          </p>
        </div>
        <Counter label="Clicks" />
      </section>
      <nav aria-label="Project resources">
        <a href="https://aster.fierst.dev/learn">
          <strong>
            Learn Aster <span aria-hidden="true">↗</span>
          </strong>
          <small>Try the interactive lessons</small>
        </a>
        <a href="https://github.com/fierstdev/aster/tree/main/docs/guides">
          <strong>
            Read the guides <span aria-hidden="true">↗</span>
          </strong>
          <small>Explore components, routing, and SSR</small>
        </a>
        <a href="https://ui.fierst.dev">
          <strong>
            Browse AsterUI <span aria-hidden="true">↗</span>
          </strong>
          <small>Add components to your project</small>
        </a>
      </nav>
    </main>
  );
}

render(<App />, document.getElementById('app')!);
