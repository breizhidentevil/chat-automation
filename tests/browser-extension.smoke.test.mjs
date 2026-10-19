import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const extensionPath = resolve(process.env.CHROME_EXTENSION_PATH ?? '.output/chrome-mv3');

test('loads the unpacked extension in real Chromium and renders its popup', { skip: process.env.RUN_BROWSER_INTEGRATION !== '1', timeout: 60000 }, async () => {
  const { chromium } = await import('playwright');
  await access(resolve(extensionPath, 'manifest.json'));
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath,
    ],
  });

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 30000 });
    }
    const extensionId = new URL(serviceWorker.url()).host;
    assert.match(extensionId, /^[a-p]{32}$/);

    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
    assert.equal(manifest.manifest_version, 3);
    assert.ok(manifest.permissions.includes('scripting'));
    assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
    assert.ok(!manifest.host_permissions?.length, 'site access must remain optional');

    const registeredScripts = await serviceWorker.evaluate(() => chrome.scripting.getRegisteredContentScripts());
    assert.equal(registeredScripts.length, 0, 'no site script should be registered before permission is granted');

    const popup = await context.newPage();
    await popup.goto('chrome-extension://' + extensionId + '/popup.html');
    await popup.getByRole('heading', { name: 'Chat Automation' }).waitFor();
    await popup.getByRole('navigation').waitFor();
    assert.match(await popup.title(), /Chat Automation/i);
  } finally {
    await context.close();
  }
});
