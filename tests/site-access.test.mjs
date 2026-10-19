import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const originSource = await readFile(new URL('../lib/site-origin.ts', import.meta.url), 'utf8');
const originCompiled = ts.transpile(originSource, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const originUrl = `data:text/javascript;base64,${Buffer.from(originCompiled).toString('base64')}`;
const source = await readFile(new URL('../services/site-access.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 })
  .replace("from '../lib/site-origin'", `from '${originUrl}'`);
const { ensureSiteAccessForTab } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function mockBrowser(overrides = {}) {
  const calls = [];
  globalThis.browser = {
    scripting: {
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

test('uses the already-loaded content script without asking for site permission', async () => {
  const previous = globalThis.browser;
  const calls = mockBrowser();
  try {
    const result = await ensureSiteAccessForTab({ id: 4, url: 'https://example.test/chat' });
    assert.deepEqual(result, { granted: true, origin: 'https://example.test', pageScriptInjected: false });
    assert.equal(calls.length, 0);
  } finally {
    if (previous === undefined) delete globalThis.browser;
    else globalThis.browser = previous;
  }
});

test('injects the content script into an already-open tab when ping is unavailable', async () => {
  const previous = globalThis.browser;
  const calls = mockBrowser({ tabs: { sendMessage: async () => { throw new Error('No receiver'); } } });
  try {
    const result = await ensureSiteAccessForTab({ id: 4, url: 'https://example.test/chat' });
    assert.deepEqual(result, { granted: true, origin: 'https://example.test', pageScriptInjected: true });
    assert.deepEqual(calls, [['execute', { target: { tabId: 4 }, files: ['/content-scripts/content.js'] }]]);
  } finally {
    if (previous === undefined) delete globalThis.browser;
    else globalThis.browser = previous;
  }
});

test('accepts tab ID zero as a valid tab identifier', async () => {
  const previous = globalThis.browser;
  mockBrowser();
  try {
    const result = await ensureSiteAccessForTab({ id: 0, url: 'https://example.test/chat' });
    assert.deepEqual(result, { granted: true, origin: 'https://example.test', pageScriptInjected: false });
  } finally {
    if (previous === undefined) delete globalThis.browser;
    else globalThis.browser = previous;
  }
});

test('rejects non-web URLs before attempting script injection', async () => {
  const previous = globalThis.browser;
  const calls = mockBrowser();
  try {
    for (const url of ['chrome://settings', 'about:blank', 'file:///tmp/page.html', 'javascript:alert(1)', undefined, 'not a URL']) {
      const result = await ensureSiteAccessForTab({ id: 7, url });
      assert.deepEqual(result, { granted: false, origin: '' });
    }
    assert.equal(calls.length, 0);
  } finally {
    if (previous === undefined) delete globalThis.browser;
    else globalThis.browser = previous;
  }
});
