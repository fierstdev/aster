# 03. Composable UI Flows with `yield*`

In traditional frameworks, interactive sub-flows—confirmation dialogs, multi-step onboarding wizards, inline editors, or step-up authentication—force you to scatter boolean flags (`isConfirmOpen`, `pendingId`, `stepIndex`) and callback props across your component.

Because Aster components are native JavaScript generators, **`yield*` lets a sub-generator temporarily take over rendering and return a strongly typed value directly to its caller**—with 0 bytes of extra framework code.

---

## Example 1: Confirmation Dialog Returning `boolean`

```tsx
function* confirmDelete(title: string): Generator<any, boolean, any> {
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

export function* TaskRow(props: { task: Task; onDelete: (id: string) => void }, ctx: Ctx<any>) {
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
