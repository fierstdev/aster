import type { Ctx } from '@fierst/aster';

type ProfileProps = { initial: string; save(name: string, signal: AbortSignal): Promise<void> };

function* confirmName(name: string, ctx: Ctx) {
  let choice: boolean | undefined;
  while (choice === undefined) {
    yield (
      <dialog
        aria-label="Confirm name"
        ref={(dialog) => ctx.afterRender(() => dialog.showModal())}
        on:cancel={(event) => {
          event.preventDefault();
          choice = false;
        }}
      >
        <p>Save the name {name}?</p>
        <button
          onClick={() => {
            choice = false;
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => {
            choice = true;
          }}
        >
          Confirm
        </button>
      </dialog>
    );
  }
  return choice;
}

export function* ProfileEditor(props: ProfileProps, ctx: Ctx<ProfileProps>) {
  let name = props.initial;
  let review = false;
  let message = '';
  let restoreFocus = false;
  let pending = false;
  async function save() {
    pending = true;
    message = 'Saving…';
    try {
      await props.save(name, ctx.signal);
      message = 'Saved';
    } catch {
      message = 'Save failed. Try again.';
    } finally {
      pending = false;
      ctx.refresh();
    }
  }
  for (props of ctx) {
    if (review) {
      review = false;
      if (yield* confirmName(name, ctx)) {
        void save();
      }
      restoreFocus = true;
    }
    yield (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) review = true;
        }}
      >
        <label>
          Name{' '}
          <input
            bind:value={name}
            readOnly={pending}
            ref={(input) => {
              if (restoreFocus) ctx.afterRender(() => input.focus());
            }}
          />
        </label>
        <button disabled={pending}>Review</button>
        <p role="status">{message}</p>
      </form>
    );
  }
}

export function ProfileDemo() {
  return (
    <ProfileEditor
      initial="Ada"
      save={async (name, signal) => {
        signal.throwIfAborted();
        localStorage.setItem('aster-profile-name', name);
      }}
    />
  );
}
