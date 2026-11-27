# Aster Documentation

Aster combines **Vite+ (`vp`)** for zero-config Rust-powered tooling with a tiny, unopinionated, browser-native runtime powered by **JavaScript Generator Components (`function*`)**, **Slot-Compiled Templates**, **Unified Web Components**, and **Automatic Event-Delegated Lazy Revival**.

## Guides

1. [Getting Started with Vite+](./guides/01-getting-started.md) — `vp dev`, `vp test`, `vp check`, `vp pack`, and universal SSR.
2. [Components, Local State, and Signals](./guides/02-components-and-state.md) — `function`, `function*`, `async function*`, `let` vs `signal()`, `bind:*`, and `try / finally`.
3. [Composable UI Flows with `yield*`](./guides/03-composable-ui-flows.md) — Confirmation modals, multi-step wizards, and automatic teardown propagation.
4. [Unified Web Components & Native Styling](./guides/04-web-components-and-styling.md) — `defineElement()`, typed attribute coercion, `@scope`, and `CSSStyleSheet`.
5. [Routing, Automatic Lazy Revival, and Error Boundaries](./guides/05-routing-ssr-and-revival.md) — Navigation API + plain `<a>` + View Transitions, automatic zero-syntax resumability, and `<ErrorBoundary>`.
6. [Using Aster in Astro](./guides/06-astro.md) — Configure a mixed-framework project, pass slots and choose when an island activates.

## Reference

Use the [API reference](./reference.md) to look up signatures, directives, renderer return values, build options, lifecycle behavior and troubleshooting steps. The [single-file handbook](../llms.txt) contains the guides and reference for offline reading and coding assistants.

## Architecture Decision Records (ADRs)

- [ADR-0001: Generator Components (`function*`) and Slot-Compiled Templates](./adr/0001-generator-components-and-slot-templates.md)
- [ADR-0002: Vite+ (`vp`) Default Toolchain & Unopinionated Browser-Native Core](./adr/0002-vite-plus-toolchain-and-unopinionated-core.md)
- [ADR-0003: Automatic Event-Delegated Lazy Revival (Zero-Syntax Resumability)](./adr/0003-automatic-event-delegated-lazy-revival.md)
- [ADR-0004: Unified Web Components & Browser-Native Platform Primitives](./adr/0004-unified-web-components-and-native-platform.md)
- [ADR-0005: Streaming SSR, Range-Anchored `claim()`, and Tree-Scoped Context](./adr/0005-streaming-ssr-and-scoped-context.md)
