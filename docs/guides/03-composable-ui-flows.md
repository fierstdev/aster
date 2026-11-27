# 03. Composable UI Flows with `yield*`

In traditional frameworks, interactive sub-flows—confirmation dialogs, multi-step onboarding wizards, inline editors, or step-up authentication—force you to scatter boolean flags (`isConfirmOpen`, `pendingId`, `stepIndex`) and callback props across your component.

Because Aster components are native JavaScript generators, **`yield*` lets a sub-generator temporarily take over rendering and return a strongly typed value directly to its caller**—with 0 bytes of extra framework code.

---

## Example 1: Confirmation Dialog Returning `boolean`

```tsx
function* confirmDelete(title: string) {
  let choice: boolean | null = null;
  while (choice === null) {
    yield (
      <div class="confirm-box" role="alertdialog">
        <span>
          Delete <strong>{title}</strong>?
        </span>
        <button onClick={() => (choice = false)}>Cancel</button>
        <button class="danger" onClick={() => (choice = true)}>
          Delete
        </button>
      </div>
    );
  }
  return choice;
}

export function* TaskRow(
  props: { task: Task; onDelete: (id: string) => void },
  ctx: Ctx<typeof props>,
) {
  let asking = false;

  for (props of ctx) {
    if (asking) {
      // Hands UI control to confirmDelete(); resumes right here with true or false!
      const confirmed = yield* confirmDelete(props.task.title);
      asking = false;
      if (confirmed) {
        props.onDelete(props.task.id);
        return;
      }
    }

    yield (
      <li>
        <span>{props.task.title}</span>
        <button onClick={() => (asking = true)}>Delete</button>
      </li>
    );
  }
}
```

---

## Example 2: Multi-Step Checkout Wizard (Zero State-Machine Libraries)

```tsx
export function* CheckoutFlow() {
  const shipping = yield* ShippingStep();
  const payment = yield* PaymentStep(shipping);
  const confirmed = yield* ReviewStep(shipping, payment);

  if (!confirmed) {
    yield <p>Order cancelled.</p>;
    return;
  }

  yield <p>Order placed for {shipping.email}!</p>;
}
```

### Automatic Teardown Propagation

If `CheckoutFlow` unmounts while the user is halfway through `PaymentStep`, Aster calls `gen.return()` on the outer generator. JavaScript automatically propagates that termination into `PaymentStep`'s `finally` block so timers, listeners, or locks are cleaned up cleanly.

## Choosing who advances a workflow

A synchronous component advances once per scheduled update. While `yield*` is active, the delegated generator receives the value passed to `.next()`. A prop update can advance the current step. Arguments captured when the step began retain their values. Key the workflow by record ID when switching records should discard an outstanding confirmation.

An async generator advances again as soon as its previous yield resolves. Use it for finite sequences such as loading, awaiting a request, and displaying a result. Keep click-driven loops in synchronous generators. In an async generator a loop that repeatedly yields while waiting for a click can prevent the browser from dispatching that click.

Exceptions thrown inside a delegated step propagate to the caller's `try/catch`. Unmount calls `.return()` on the outer generator and runs active nested `finally` blocks from the inside out. Use `ctx.signal` for work that supports cancellation and `ctx.refresh()` to request a render after other asynchronous work finishes.

The [profile editor](https://github.com/fierstdev/aster/blob/main/playground/profile-editor.tsx) in the playground showcase demonstrates editing, confirmation with a native dialog, Escape, focus restoration, and retry after a failed save. Its confirmation returns a boolean inferred by TypeScript.

### Moving focus after a yield

Pass the component context into a delegated step to open a dialog once its controls and listeners are ready.

```tsx
function* confirm(ctx: Ctx) {
  let accepted: boolean | undefined;
  while (accepted === undefined) {
    yield (
      <dialog
        aria-label="Confirm change"
        ref={(dialog) => ctx.afterRender(() => dialog.showModal())}
        on:cancel={(event) => {
          event.preventDefault();
          accepted = false;
        }}
      >
        <button
          onClick={() => {
            accepted = false;
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => {
            accepted = true;
          }}
        >
          Confirm
        </button>
      </dialog>
    );
  }
  return accepted;
}
```

`ctx.afterRender(callback)` runs once, in registration order, immediately after **this component's** next successful DOM patch. This includes mounting, updates, async yields, and claiming server HTML. Refs point to their elements and synchronous children have mounted by then. The container can be detached, and browser paint and pending async children have their own timing.

Registration alone does not schedule a render. A callback registered inside another callback waits for the next patch. Unmount, replacement of the generator execution, or a failed render discards pending work. Server rendering skips these callbacks. A thrown error or a returned promise rejection goes to the component's error boundary while the execution is active.
