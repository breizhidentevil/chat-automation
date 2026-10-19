import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/history.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { deduplicateConversationMessages, mergeConversationMessage, limitConversationHistory, upsertConversationMessage, markInterruptedMessagesIncomplete } = await import(moduleUrl);

function message(overrides = {}) {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    origin: 'https://example.com',
    role: 'assistant',
    content: 'Hello',
    contentTruncated: false,
    status: 'streaming',
    firstSeenAt: 1000,
    lastUpdatedAt: 1000,
    source: 'dom',
    ...overrides,
  };
}

test('deduplication collapses duplicate DOM nodes seen within one second', () => {
  const result = deduplicateConversationMessages([
    message({ id: 'node-a', firstSeenAt: 1000 }),
    message({ id: 'node-b', firstSeenAt: 1800, lastUpdatedAt: 1800 }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'node-a');
  assert.equal(result[0].firstSeenAt, 1000);
  assert.equal(result[0].lastUpdatedAt, 1800);
});

test('identical text in different conversations or roles is not collapsed', () => {
  const result = deduplicateConversationMessages([
    message({ id: 'a' }),
    message({ id: 'b', conversationId: 'conversation-2' }),
    message({ id: 'c', role: 'user' }),
  ]);
  assert.equal(result.length, 3);
});

test('identical text first seen more than one second apart remains distinct', () => {
  const result = deduplicateConversationMessages([
    message({ id: 'a', firstSeenAt: 1000 }),
    message({ id: 'b', firstSeenAt: 2001 }),
  ]);
  assert.equal(result.length, 2);
});

test('deduplication preserves the strongest status and latest completion timestamp', () => {
  const result = deduplicateConversationMessages([
    message({ id: 'a', status: 'complete', completedAt: 1500, lastUpdatedAt: 1500 }),
    message({ id: 'b', status: 'streaming', lastUpdatedAt: 1900 }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'complete');
  assert.equal(result[0].completedAt, 1500);
  assert.equal(result[0].lastUpdatedAt, 1900);
});

test('deduplication sorts output by first-seen timestamp', () => {
  const result = deduplicateConversationMessages([
    message({ id: 'later', firstSeenAt: 5000 }),
    message({ id: 'earlier', firstSeenAt: 1000 }),
  ]);
  assert.deepEqual(result.map(item => item.id), ['earlier', 'later']);
});

test('a late streaming update cannot downgrade a completed message', () => {
  const completed = message({ status: 'complete', completedAt: 1800, lastUpdatedAt: 1800 });
  const lateStreaming = message({ status: 'streaming', lastUpdatedAt: 2200, content: 'Hello, still updating' });
  const result = mergeConversationMessage(completed, lateStreaming);
  assert.equal(result.status, 'complete');
  assert.equal(result.completedAt, 1800);
  assert.equal(result.content, 'Hello, still updating');
  assert.equal(result.lastUpdatedAt, 2200);
});

test('a completed update finalizes an incomplete message and records completion time', () => {
  const incomplete = message({ status: 'incomplete', lastUpdatedAt: 1500 });
  const completed = message({ status: 'complete', lastUpdatedAt: 2000, completedAt: 1900 });
  const result = mergeConversationMessage(incomplete, completed);
  assert.equal(result.status, 'complete');
  assert.equal(result.completedAt, 1900);
});

test('history limits retain the newest entries and enforce the entry-count limit', () => {
  const result = limitConversationHistory([
    message({ id: 'old', firstSeenAt: 1 }),
    message({ id: 'middle', firstSeenAt: 2 }),
    message({ id: 'new', firstSeenAt: 3 }),
  ], 2, 10000);
  assert.deepEqual(result.map(item => item.id), ['middle', 'new']);
});

test('history limits retain the newest entry when it alone exceeds the approximate budget', () => {
  const result = limitConversationHistory([
    message({ id: 'old', content: 'old' }),
    message({ id: 'new', content: 'x'.repeat(100) }),
  ], 10, 50);
  assert.deepEqual(result.map(item => item.id), ['new']);
});


test('a rejected background upsert never falls back to direct storage writes', async () => {
  const previousBrowser = globalThis.browser;
  let writes = 0;
  globalThis.browser = {
    runtime: { sendMessage: async () => ({ ok: false }) },
    storage: { local: {
      get: async () => ({ chatAutomationHistoryV1: [] }),
      set: async () => { writes += 1; },
    } },
  };
  try {
    await upsertConversationMessage(message());
    assert.equal(writes, 0);
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
  }
});

test('a rejected background reconciliation never falls back to direct storage writes', async () => {
  const previousBrowser = globalThis.browser;
  let writes = 0;
  globalThis.browser = {
    runtime: { sendMessage: async () => ({ ok: false }) },
    storage: { local: {
      get: async () => ({ chatAutomationHistoryV1: [message()] }),
      set: async () => { writes += 1; },
    } },
  };
  try {
    await markInterruptedMessagesIncomplete('https://example.com');
    assert.equal(writes, 0);
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
  }
});
