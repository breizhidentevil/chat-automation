import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = await readFile(new URL('../wxt.config.ts', import.meta.url), 'utf8');
const contentScript = await readFile(new URL('../entrypoints/content/index.ts', import.meta.url), 'utf8');
const popup = await readFile(new URL('../entrypoints/popup/main.tsx', import.meta.url), 'utf8');
const requireBackgroundSource = await readFile(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');

test('does not request mandatory access to every website', () => {
  assert.doesNotMatch(config, /host_permissions:\s*\[['"]<all_urls>['"]\]/);
  assert.match(config, /optional_host_permissions:\s*\[['"]http:\/\/\*\/\*['"],\s*['"]https:\/\/\*\/\*['"]\]/);
  assert.match(config, /delete manifest\.host_permissions/);
});

test('registers the page script dynamically only after per-site permission', () => {
  assert.match(contentScript, /registration:\s*['"]runtime['"]/);
  assert.match(contentScript, /matches:\s*\[['"]<all_urls>['"]\]/);
  assert.match(popup, /browser\.permissions\.request\(\{ origins: \[pattern\] \}\)/);
  assert.match(popup, /browser\.scripting\.registerContentScripts/);
  assert.match(popup, /contentScriptIdForOrigin\(origin\)/);
  assert.match(popup, /const legacyId = 'chat-automation-' \+ origin\.replace/);
  assert.match(popup, /browser\.scripting\.unregisterContentScripts\(\{ ids: \[legacyId\] \}\)/);
  assert.match(popup, /files: \[['"]\/?content-scripts\/content\.js['"]\]/);
  assert.match(popup, /Activer sur ce site/);
});

test('unregisters dynamically registered scripts when site access is revoked', () => {
  const background = requireBackgroundSource;
  assert.match(background, /browser\.permissions\.onRemoved\.addListener/);
  assert.match(background, /browser\.scripting\.getRegisteredContentScripts\(\)/);
  assert.match(background, /browser\.scripting\.unregisterContentScripts\(\{ ids \}\)/);
  assert.match(background, /origins\.includes\(match\)/);
});

test('allows local data deletion only from the extension UI and serializes history deletion', () => {
  assert.match(requireBackgroundSource, /isExtensionUiSender\(sender\) && message\.type === 'CHAT_HISTORY_CLEAR_SITE'/);
  assert.match(requireBackgroundSource, /!sender\.tab/);
  assert.match(requireBackgroundSource, /sender\.url\.startsWith\(browser\.runtime\.getURL\('\/'\)\)/);
  assert.match(requireBackgroundSource, /backgroundClearSiteHistory\(origin\)/);
  assert.match(requireBackgroundSource, /isExtensionUiSender\(sender\) && message\.type === 'CHAT_LOGS_CLEAR'/);
  assert.match(requireBackgroundSource, /browser\.storage\.local\.remove\(LOG_KEY\)/);
  assert.match(popup, /confirmClearHistory/);
  assert.match(popup, /confirmClearLogs/);
  assert.match(popup, /type: 'CHAT_HISTORY_CLEAR_SITE'/);
  assert.match(popup, /type: 'CHAT_LOGS_CLEAR'/);
});


test('prevents cleared visible history from being immediately captured again', () => {
  assert.match(requireBackgroundSource, /type: 'CHAT_HISTORY_CLEARED', origin/);
  assert.match(contentScript, /message\.type === 'CHAT_HISTORY_CLEARED'/);
  assert.match(contentScript, /historyClearedContent\.set\(candidate\.element, candidate\.content\)/);
  assert.match(contentScript, /if \(content === contentAtClear\) continue/);
  assert.match(contentScript, /historyClearedContent\.delete\(element\)/);
});

test('suppresses pre-clear DOM nodes even when they were not recognized as message candidates', () => {
  assert.match(contentScript, /historyClearedExistingElements = new WeakMap<HTMLElement, boolean>\(\)/);
  assert.match(contentScript, /document\.querySelectorAll<HTMLElement>\('\*'\)/);
  assert.match(contentScript, /historyClearedExistingElements\.set\(element, true\)/);
  assert.match(contentScript, /historyClearedExistingElements\.get\(element\) === true\) continue/);
  assert.match(contentScript, /historyClearedExistingElements\.set\(element, false\)/);
});

test('stops active page scripts and history capture when host permission is revoked', () => {
  assert.match(requireBackgroundSource, /browser\.tabs\.query\(\{ url: origins \}\)/);
  assert.match(requireBackgroundSource, /CHAT_AUTOMATION_PERMISSION_REVOKED/);
  assert.match(contentScript, /message\.type === 'CHAT_AUTOMATION_PERMISSION_REVOKED'/);
  assert.match(contentScript, /historyObserver\?\.disconnect\(\)/);
  assert.match(contentScript, /historyPollTimer !== undefined/);
  assert.match(contentScript, /historyPollTimer = undefined/);
  assert.match(contentScript, /siteAccessRevoked\) return \{ message:/);
  assert.match(contentScript, /siteAccessRevoked = true/);
  assert.match(contentScript, /if \(siteAccessRevoked\) return/);
});

test('does not export other conversations when the selected conversation has no records', () => {
  const exportFunction = popup.match(/async function exportHistory\(\) \{[\\s\\S]*?\n  \}/)?.[0];
  assert.ok(exportFunction, 'history export function should exist');
  assert.match(exportFunction, /const selectedItems = historyConversationId \? exactConversation : siteItems/);
  assert.doesNotMatch(exportFunction, /exactConversation\.length > 0 \? exactConversation : siteItems/);
});
