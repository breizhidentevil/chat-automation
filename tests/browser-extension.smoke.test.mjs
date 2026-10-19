import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import test from 'node:test';

const extensionPath = resolve(process.env.CHROME_EXTENSION_PATH ?? '.output/chrome-mv3');

test('loads the unpacked extension in real Chromium and renders its popup', { skip: process.env.RUN_BROWSER_INTEGRATION !== '1', timeout: 60000 }, async () => {
  const { chromium } = await import('playwright');
  await access(resolve(extensionPath, 'manifest.json'));
  const context = await chromium.launchPersistentContext('', {
    headless: false,
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
    assert.equal(await popup.title(), 'Chat Site Automation');

    // Exercise the real popup/background path for history deletion, not just the helper.
    await popup.close();
    const fixtureServer = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><head><title>Fixture chat</title></head><body><main>Fixture chat page</main></body></html>');
    });
    fixtureServer.listen(0, '127.0.0.1');
    await once(fixtureServer, 'listening');

    try {
      const address = fixtureServer.address();
      assert.ok(address && typeof address === 'object');
      const fixtureUrl = 'http://127.0.0.1:' + address.port + '/chat';
      const fixtureTab = await context.newPage();
      await fixtureTab.goto(fixtureUrl);
      const origin = new URL(fixtureUrl).origin;
      const conversationId = fixtureUrl;

      await serviceWorker.evaluate(({ origin, conversationId }) => chrome.storage.local.set({
        chatAutomationHistoryV1: [{
          id: 'browser-test-message',
          conversationId,
          origin,
          role: 'user',
          content: 'message to clear',
          contentTruncated: false,
          status: 'complete',
          firstSeenAt: 100,
          lastUpdatedAt: 100,
          completedAt: 100,
          source: 'dom',
        }],
      }), { origin, conversationId });

      const popupEvent = context.waitForEvent('page', { timeout: 15000 });
      await serviceWorker.evaluate(() => chrome.action.openPopup());
      const actionPopup = await popupEvent;
      await actionPopup.getByRole('button', { name: /history|historique/i }).click();
      await actionPopup.getByRole('button', { name: /clear site history|effacer l'historique du site|effacer l’historique du site/i }).waitFor();
      actionPopup.on('dialog', dialog => dialog.accept());
      await actionPopup.getByRole('button', { name: /clear site history|effacer l'historique du site|effacer l’historique du site/i }).click();

      await actionPopup.getByRole('status').filter({ hasText: /history cleared|historique effacé|historique supprimé/i }).waitFor({ timeout: 10000 });
      const cleared = await serviceWorker.evaluate(() => chrome.storage.local.get([
        'chatAutomationHistoryV1',
        'chatAutomationHistoryClearedAtV1',
      ]));
      assert.ok(!cleared.chatAutomationHistoryV1?.some(message => message.origin === origin));
      assert.equal(typeof cleared.chatAutomationHistoryClearedAtV1?.[origin], 'number');
      await fixtureTab.close();
      await actionPopup.close();
    } finally {
      await new Promise(resolve => fixtureServer.close(resolve));
    }
  } finally {
    await context.close();
  }
});
