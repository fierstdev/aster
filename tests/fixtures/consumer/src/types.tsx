import type { ComponentFn } from '@fierst/aster';
declare global {
  interface GlobalEventHandlersEventMap {
    'profile-update': CustomEvent<{ name: string }>;
  }
}
const field = (
  <input ref={(input) => input.select()} onInput={(event) => event.currentTarget.value.trim()} />
);
const custom = (
  <profile-field
    displayMode="compact"
    on:profile-update={(event) => {
      event.detail.name.trim();
      event.currentTarget.focus();
    }}
  />
);
const keyField = (
  <input
    on:keydown={(event) => {
      event.key.toLowerCase();
      event.currentTarget.select();
    }}
  />
);
const svg = (
  <circle
    onPointerDown={(event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      return event.currentTarget.r.baseVal.value;
    }}
  />
);
const button = <button data-mode="test" aria-label="Save" />;
// @ts-expect-error Misspelled handler
const typo = <input onInpt={() => {}} />;
// @ts-expect-error A checkbox binding must carry a boolean
const bad = <input bind:checked="yes" />;
function* step() {
  yield field;
  return { name: 'Ada' };
}
const flow: ComponentFn = function* (_, ctx) {
  ctx.afterRender(() => document.querySelector('input')?.focus());
  const result = yield* step();
  yield result.name.toLowerCase();
  // @ts-expect-error step returns a name
  yield result.email;
};
export { field, custom, keyField, svg, button, typo, bad, flow };
