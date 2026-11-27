import { type Ctx } from '@fierst/aster';
import { LESSONS } from './lessons.ts';
import { compileLesson, mountSandbox } from './sandbox.ts';

export function* LearnView(_props: Record<string, any>, ctx: Ctx) {
  let activeIndex = 0;
  let code = LESSONS[0].starter;
  let rightTab = 'preview' as 'preview' | 'compiled';
  let compiledOutput = '';
  let runtimeError: string | null = null;
  let previewEl: HTMLDivElement | null = null;
  let disposePreview = null as (() => void) | null;

  const updateOutput = () => {
    if (rightTab === 'compiled') {
      try {
        compiledOutput = compileLesson(code);
        runtimeError = null;
      } catch (error) {
        compiledOutput = '';
        runtimeError = error instanceof Error ? error.message : String(error);
      }
      return;
    }
    if (!previewEl) return;
    disposePreview?.();
    disposePreview = null;
    const res = mountSandbox(code, previewEl);
    disposePreview = res.dispose;
    compiledOutput = res.compiled;
    runtimeError = res.error;
  };

  const selectLesson = (idx: number) => {
    activeIndex = idx;
    code = LESSONS[idx].starter;
    rightTab = 'preview';
    updateOutput();
  };

  const showSolution = () => {
    code = LESSONS[activeIndex].solution;
    updateOutput();
  };

  const resetLesson = () => {
    code = LESSONS[activeIndex].starter;
    updateOutput();
  };

  try {
    for (;;) {
      const lesson = LESSONS[activeIndex];
      const hasPrev = activeIndex > 0;
      const hasNext = activeIndex < LESSONS.length - 1;

      yield (
        <div class="learn-grid">
          <aside class="learn-pane learn-left">
            <div class="learn-chapters">
              {LESSONS.map((l, idx) => (
                <button
                  key={l.id}
                  class="chapter-pill"
                  class:active={idx === activeIndex}
                  onClick={() => selectLesson(idx)}
                >
                  {l.number}. {l.concept}
                </button>
              ))}
            </div>

            <div class="learn-copy">
              <span class="eyebrow">
                Lesson {lesson.number} of {LESSONS.length}
              </span>
              <h2>{lesson.title}</h2>
              <p class="muted">{lesson.subtitle}</p>
              {lesson.explanation.map((para, i) => (
                <p key={i} class="prose-p">
                  {para}
                </p>
              ))}
              <div class="task-callout">
                <span class="eyebrow">Try It</span>
                <p>{lesson.task}</p>
              </div>
            </div>

            <div class="learn-footer">
              <div class="row">
                <button class="btn" onClick={resetLesson}>
                  Reset
                </button>
                <button class="btn" onClick={showSolution}>
                  Solve
                </button>
              </div>
              <div class="row">
                <button
                  class="btn"
                  disabled={!hasPrev}
                  onClick={() => selectLesson(activeIndex - 1)}
                >
                  Prev
                </button>
                <button
                  class="btn primary"
                  disabled={!hasNext}
                  onClick={() => selectLesson(activeIndex + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </aside>

          <section class="learn-pane learn-right">
            <div class="editor-bar">
              <span class="mono-label">App.jsx</span>
              <div class="row">
                <button
                  class="tab-btn"
                  class:active={rightTab === 'preview'}
                  onClick={() => (rightTab = 'preview')}
                >
                  Live Preview
                </button>
                <button
                  class="tab-btn"
                  class:active={rightTab === 'compiled'}
                  onClick={() => {
                    disposePreview?.();
                    disposePreview = null;
                    previewEl = null;
                    rightTab = 'compiled';
                    updateOutput();
                  }}
                >
                  Compiled Slots
                </button>
              </div>
            </div>

            <textarea
              class="code-editor"
              spellcheck="false"
              value={code}
              onInput={(event) => {
                code = event.currentTarget.value;
                updateOutput();
              }}
            />

            {rightTab === 'preview' ? (
              <div class="preview-panel">
                <div class="preview-header">
                  <span class="mono-label">Output</span>
                  {runtimeError ? (
                    <span class="pill err">Error</span>
                  ) : (
                    <span class="pill ok">Live</span>
                  )}
                </div>
                {runtimeError ? <pre class="error-pre">{runtimeError}</pre> : null}
                <div
                  class="preview-stage"
                  ref={(el) => {
                    previewEl = el;
                    ctx.afterRender(() => {
                      updateOutput();
                      ctx.refresh();
                    });
                  }}
                />
              </div>
            ) : (
              <div class="preview-panel">
                <div class="preview-header">
                  <span class="mono-label">Hoisted _tpl() / _slot() Output</span>
                  <span class="pill">Zero VDOM</span>
                </div>
                {runtimeError ? (
                  <pre role="alert" class="error-pre">
                    {runtimeError}
                  </pre>
                ) : (
                  <pre class="code">{compiledOutput}</pre>
                )}
              </div>
            )}
          </section>
        </div>
      );
    }
  } finally {
    disposePreview?.();
  }
}
