import assert from 'node:assert/strict';

// Exercise browser form activation under the same policy and component markup
// for client mount, string SSR and deferred streaming SSR.
export async function checkForms(page, origin, documents, panelUrl, nonce) {
  const mount = `<div id="app"></div><script nonce="${nonce}" type="module">import {mountNativeForm} from ${JSON.stringify(panelUrl)};mountNativeForm()</script>`;
  for (const [path, body] of Object.entries({ mount, ...documents })) {
    const url = origin + '/forms/' + path;
    await page.route(url, (route) =>
      route.fulfill({
        contentType: 'text/html',
        headers: {
          'Content-Security-Policy': `script-src 'self' 'nonce-${nonce}'`,
        },
        body,
      }),
    );
    const submissions = [];
    const capture = (route) => {
      submissions.push(new URL(route.request().url()).searchParams);
      return route.fulfill({ contentType: 'text/html', body: 'Saved' });
    };
    await page.route('**/submitted?*', capture);
    try {
      for (const [draft, activation] of [
        ['cancel', 'enter'],
        ['accepted', 'enter'],
        ['accepted', 'submit'],
        ['accepted', 'escape'],
      ]) {
        await page.goto(url);
        const form = page.locator('form');
        await form.waitFor();
        if (path === 'stream') await page.getByText('Stream complete').waitFor();
        await page.evaluate(() => {
          const iframe = document.createElement('iframe');
          iframe.name = 'result';
          iframe.hidden = true;
          document.body.appendChild(iframe);
        });
        const input = page.locator('input[name=draft]');
        assert.equal(await input.inputValue(), 'initial');
        assert.equal(await page.locator('[name=first]').inputValue(), 'spread');
        assert.equal(await page.locator('[name=last]').inputValue(), 'literal');
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const component = new URL(panelUrl, origin).href;
        if (path !== 'mount')
          await page.route(component, async (route) => {
            await gate;
            await route.continue();
          });
        const before = submissions.length;
        try {
          if (activation === 'escape') await input.press('Escape');
          else {
            await input.fill(draft);
            if (activation === 'enter') await input.press('Enter');
            else await form.evaluate((el) => el.requestSubmit(el.querySelector('button')));
          }
        } finally {
          release();
        }
        if (activation === 'escape') {
          await page.locator('form[data-escape=yes]').waitFor();
        } else {
          await page.locator('form[data-submissions="1"]').waitFor();
          assert.equal(await form.getAttribute('data-submitter'), 'save');
          assert.equal(await form.getAttribute('data-draft'), draft);
          assert.equal(await input.inputValue(), draft);
          if (draft !== 'cancel') {
            await page
              .frameLocator('[name=result]')
              .getByText('Saved')
              .waitFor({ state: 'attached' });
            assert.deepEqual(Object.fromEntries(submissions.at(-1)), {
              draft,
              first: 'spread',
              last: 'literal',
              intent: 'save',
            });
          }
          assert.equal(submissions.length - before, draft === 'cancel' ? 0 : 1);
        }
        if (path !== 'mount') await page.unroute(component);
      }
    } finally {
      await page.unroute(url);
      await page.unroute('**/submitted?*', capture);
    }
  }
}
