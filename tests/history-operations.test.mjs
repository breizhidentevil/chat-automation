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
const {
  deduplicateConversationMessages,
  mergeConversationMessage,
  limitConversationHistory,
} = await import(moduleUrl);

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

test('merge keeps a completed status when a late streaming update arrives', () => {
  const completed = message({ status: 'complete', lastUpdatedAt: 3000, completedAt: 2500, content: 'Final' });
  const lateStreaming = message({ status: 'streaming', lastUpdatedAt: 2000, content: 'Partial' });
  const merged = mergeConversationMessage(completed, lateStreaming);
  assert.equal(merged.status, 'complete');
  assert.equal(merged.content, 'Final');
  assert.equal(merged.completedAt, 2500);
});

test('deduplication collapses near-simultaneous duplicate DOM messages', () => {
  const first = message({ id: 'first', firstSeenAt: 1000, lastUpdatedAt: 1100 });
  const duplicate = message({ id: 'second', firstSeenAt: 1500, lastUpdatedAt: 1600, status: 'complete', completedAt: 1500 });
  const distinct = message({ id: 'third', firstSeenAt: 4000, lastUpdatedAt: 4000 });
  const result = deduplicateConversationMessages([first, duplicate, distinct]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'first');
  assert.equal(result[0].status, 'complete');
});

test('history limits retain the newest entries within count and text budgets', () => {
  const entries = Array.from({ length: 5 }, (_, index) => message({
    id: `message-${index}`,
    firstSeenAt: index + 1,
    lastUpdatedAt: index + 1,
    content: 'x'.repeat(100),
  }));
  const limited = limitConversationHistory(entries, 3, 1000);
  assert.deepEqual(limited.map(item => item.id), ['message-2', 'message-3', 'message-4']);
});

test('history limits retain at least the newest single entry even if it exceeds the budget', () => {
  const entries = [
    message({ id: 'old', firstSeenAt: 1, lastUpdatedAt: 1, content: 'x'.repeat(100) }),
    message({ id: 'new', firstSeenAt: 2, lastUpdatedAt: 2, content: 'x'.repeat(500) }),
  ];
  const limited = limitConversationHistory(entries, 100, 100);
  assert.deepEqual(limited.map(item => item.id), ['new']);
});
