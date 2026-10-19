import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = await readFile(new URL('../wxt.config.ts', import.meta.url), 'utf8');
const contentScript = await readFile(new URL('../entrypoints/content/index.ts', import.meta.url), 'utf8');
const popup = await readFile(new URL('../entrypoints/popup/main.tsx', import.meta.url), 'utf8');

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
  assert.match(popup, /files: \[['"]content-scripts\/content\.js['"]\]/);
  assert.match(popup, /Activer sur ce site/);
});
