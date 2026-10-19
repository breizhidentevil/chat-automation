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
  assert.match(requireBackgroundSource, /sender\.id === browser\.runtime\.id && message\.type === 'CHAT_HISTORY_CLEAR_SITE'/);
  assert.match(requireBackgroundSource, /backgroundClearSiteHistory\(origin\)/);
  assert.match(requireBackgroundSource, /sender\.id === browser\.runtime\.id && message\.type === 'CHAT_LOGS_CLEAR'/);
  assert.match(requireBackgroundSource, /browser\.storage\.local\.remove\(LOG_KEY\)/);
  assert.match(popup, /confirmClearHistory/);
  assert.match(popup, /confirmClearLogs/);
  assert.match(popup, /type: 'CHAT_HISTORY_CLEAR_SITE'/);
  assert.match(popup, /type: 'CHAT_LOGS_CLEAR'/);
});
