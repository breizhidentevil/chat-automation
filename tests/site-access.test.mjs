import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const idSource = await readFile(new URL('../lib/content-script-id.ts', import.meta.url), 'utf8');
const idCompiled = ts.transpile(idSource, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const idUrl = `data:text/javascript;base64,${Buffer.from(idCompiled).toString('base64')}`;
const source = await readFile(new URL('../services/site-access.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 })
  .replace("from '../lib/content-script-id'", `from '${idUrl}'`);
const { ensureSiteAccessForTab } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function mockBrowser(overrides = {}) {
  const calls = [];
  globalThis.browser = {
    permissions: {
      contains: async () => false,
      request: async () => true,
      ...overrides.permissions,
    },
    scripting: {
      getRegisteredContentScripts: async () => [],
      unregisterContentScripts: async options => { calls.push(['unregister', options]); },
      registerContentScripts: async scripts => { calls.push(['register', scripts]); },
      executeScript: async options => { calls.push(['execute', options]); },
      ...overrides.scripting,
    },
    tabs: {
      sendMessage: async () => ({ ready: true }),
      ...overrides.tabs,
    },
  };
  return calls;
}

test('does not register a script when the user denies site permission', async () => {
  const previous = globalThis.browser;
  const calls = mockBrowser({ permissions: { request: async () => false } });
  try {
    const result = await ensureSiteAccessForTab({ id: 4, url: 'https://example.test/chat' });
    assert.deepEqual(result, { granted: false, origin: 'https://example.test' });
    assert.equal(calls.length, 0);
  } finally {
    if (previous === undefined) delete globalThis.browser;
    else globalThis.browser = previous;
  }
});

test('registers a site-specific content script only after permission is granted', async () => {
  const previous = globalThis.browser;
  const calls = mockBrowser();
  try {
    const result = await ensureSiteAccessForTab({ id: 4, url: 'https://example.test/chat' });
    assert.deepEqual(result, { granted: true, origin: 'https://example.test', pageScriptInjected: false });
    assert.equal(calls.filter(([name]) => name === 'register').length, 1);
    assert.equal(calls.filter(([name]) => name === 'execute').length, 0);
  } finally {
    if (previous === undefined) delete globalThis.browser;
    else globalThis.browser = previous;
  }
});

test('injects the script into an already-open tab when ping is unavailable', async () => {
  const previous = globalThis.browser;
  const calls = mockBrowser({ tabs: { sendMessage: async () => { throw new Error('No receiver'); } } });
  try {
    const result = await ensureSiteAccessForTab({ id: 4, url: 'https://example.test/chat' });
    assert.deepEqual(result, { granted: true, origin: 'https://example.test', pageScriptInjected: true });
    assert.equal(calls.filter(([name]) => name === 'execute').length, 1);
  } finally {
    if (previous === undefined) delete globalThis.browser;
    else globalThis.browser = previous;
  }
});
