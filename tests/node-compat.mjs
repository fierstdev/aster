import assert from 'node:assert/strict';
import { html } from '@fierst/aster';
import { renderToString, streamResponse } from '@fierst/aster/ssr';

const view = html`<p>${'hello'}</p>`;
assert.equal(renderToString(view), '<p>hello</p>');
assert.ok((await streamResponse(view).text()).includes('<p>hello</p>'));
console.log('Packed SSR passed on', process.version);
