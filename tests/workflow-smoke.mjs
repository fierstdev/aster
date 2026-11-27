import assert from 'node:assert/strict';

export async function checkEditor(page, origin, documents, manifest) {
  const moduleUrl = manifest['/src/profile-editor.tsx'];
  const mount = `<main></main><script type="module">import {mountProfileDemo} from ${JSON.stringify(moduleUrl)}; mountProfileDemo(document.querySelector('main'));</script>`;
  for (const [mode, body] of Object.entries({ mount, ...documents })) {
    const url = origin + '/profile/' + mode;
    await page.route(url, (route) => route.fulfill({ contentType: 'text/html', body }));
    try {
      await page.goto(url);
      const field = page.getByRole('textbox', { name: 'Name' });
      await field.fill('Grace');
      await field.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Confirm name' });
      await dialog.waitFor();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.tagName === 'INPUT');
      assert.equal(await field.inputValue(), 'Grace');
      await page.evaluate(() => {
        const original = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
        Storage.prototype.setItem = function () {
          Object.defineProperty(Storage.prototype, 'setItem', original);
          throw new Error('Storage unavailable');
        };
      });
      for (const message of ['Save failed. Try again.', 'Saved']) {
        await field.press('Enter');
        await dialog.getByRole('button', { name: 'Confirm' }).click();
        await page.getByText(message, { exact: true }).waitFor();
        assert.equal(await field.inputValue(), 'Grace');
      }
      assert.equal(await page.evaluate(() => localStorage.getItem('aster-profile-name')), 'Grace');
      await field.press('Enter');
      await dialog.waitFor();
      await page.goto('about:blank');
    } finally {
      await page.unroute(url);
    }
  }
}
