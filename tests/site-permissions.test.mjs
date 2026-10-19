import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = await readFile(new URL('../wxt.config.ts', import.meta.url), 'utf8');
const contentScript = await readFile(new URL('../entrypoints/content/index.ts', import.meta.url), 'utf8');
const popup = await readFile(new URL('../entrypoints/popup/main.tsx', import.meta.url), 'utf8');
const historyHook = await readFile(new URL('../entrypoints/popup/hooks/useHistory.ts', import.meta.url), 'utf8');
const logsHook = await readFile(new URL('../entrypoints/popup/hooks/useLogs.ts', import.meta.url), 'utf8');
const siteAccessService = await readFile(new URL('../services/site-access.ts', import.meta.url), 'utf8');
const requireBackgroundSource = await readFile(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');

test('does not request mandatory access to every website', () => {
  assert.doesNotMatch(config, /host_permissions:\s*\[['"]<all_urls>['"]\]/);
  assert.match(config, /optional_host_permissions:\s*\[['"]http:\/\/\*\/\*['"],\s*['"]https:\/\/\*\/\*['"]\]/);
  assert.match(config, /delete manifest\.host_permissions/);
});

test('registers the page script dynamically only after per-site permission', () => {
  assert.match(contentScript, /registration:\s*['"]runtime['"]/);
  assert.match(contentScript, /matches:\s*\[['"]<all_urls>['"]\]/);
  assert.match(siteAccessService, /browser\.permissions\.request\(\{ origins: \[pattern\] \}\)/);
  assert.match(siteAccessService, /browser\.scripting\.registerContentScripts/);
  assert.match(siteAccessService, /contentScriptIdForOrigin\(origin\)/);
  assert.match(siteAccessService, /const legacyId = 'chat-automation-' \+ origin\.replace/);
  assert.match(siteAccessService, /browser\.scripting\.unregisterContentScripts\(\{ ids: \[legacyId\] \}\)/);
  assert.match(siteAccessService, /files: \[['"]\/?content-scripts\/content\.js['"]\]/);
  assert.match(popup, /t\('enableOnSite'\)/);
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
  assert.match(historyHook, /confirmClearHistory/);
  assert.match(logsHook, /confirmClearLogs/);
  assert.match(historyHook, /type: 'CHAT_HISTORY_CLEAR_SITE'/);
  assert.match(logsHook, /type: 'CHAT_LOGS_CLEAR'/);
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

test('history export delegates conversation scoping to the tested selection helper', () => {
  const exportFunction = historyHook.match(/async function exportHistory\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(exportFunction, 'history export function should exist');
  assert.match(exportFunction, /selectHistoryExportMessages\(/);
  assert.doesNotMatch(exportFunction, /exactConversation\.length > 0 \? exactConversation : siteItems/);
});

test('declares Firefox MV3 identity and no external data collection', () => {
  assert.match(config, /browser === 'firefox' \? \{/);
  assert.match(config, /browser_specific_settings:\s*\{[\s\S]*?gecko:\s*\{[\s\S]*?id:\s*'chat-automation@breizhidentevil\.github\.io'/);
  assert.match(config, /data_collection_permissions:\s*\{\s*required:\s*\['none'\]\s*\}/);
});

test('history export selection scopes by origin and selected conversation and sorts chronologically', async () => {
  const source = await readFile(new URL('../lib/history-export.ts', import.meta.url), 'utf8');
  const compiled = (await import('typescript')).default.transpile(source, {
    module: (await import('typescript')).default.ModuleKind.ESNext,
    target: (await import('typescript')).default.ScriptTarget.ES2022,
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
  const { selectHistoryExportMessages } = await import(moduleUrl);
  const messages = [
    { id: 'late', origin: 'https://example.com', conversationId: 'conversation-a', firstSeenAt: 30 },
    { id: 'other', origin: 'https://example.com', conversationId: 'conversation-b', firstSeenAt: 20 },
    { id: 'foreign', origin: 'https://other.example', conversationId: 'conversation-a', firstSeenAt: 10 },
    { id: 'early', origin: 'https://example.com', conversationId: 'conversation-a', firstSeenAt: 5 },
  ];

  assert.deepEqual(
    selectHistoryExportMessages(messages, 'https://example.com', 'conversation-a').map(item => item.id),
    ['early', 'late'],
  );
  assert.deepEqual(
    selectHistoryExportMessages(messages, 'https://example.com', 'missing-conversation'),
    [],
  );
  assert.deepEqual(
    selectHistoryExportMessages(messages, 'https://example.com', '').map(item => item.id),
    ['early', 'other', 'late'],
  );
});

test('history export uses the tested selection helper', () => {
  assert.match(historyHook, /selectHistoryExportMessages\(/);
  assert.match(historyHook, /from '\.\.\/\.\.\/\.\.\/lib\/history-export'/);
});
