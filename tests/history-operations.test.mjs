import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const validationSource = await readFile(new URL('../lib/history-validation.ts', import.meta.url), 'utf8');
const compiledValidation = ts.transpile(validationSource, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const validationUrl = `data:text/javascript;base64,${Buffer.from(compiledValidation).toString('base64')}`;
const source = await readFile(new URL('../lib/history.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
}).replace("from './history-validation'", `from '${validationUrl}'`);
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

test('deduplication merges repeated updates with the same identity', () => {
  const first = message({ id: 'same', firstSeenAt: 1000, lastUpdatedAt: 1100 });
  const update = message({ id: 'same', firstSeenAt: 1000, lastUpdatedAt: 1600, status: 'complete', completedAt: 1500, content: 'Final' });
  const result = deduplicateConversationMessages([first, update]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'same');
  assert.equal(result[0].status, 'complete');
  assert.equal(result[0].content, 'Final');
});

test('preserves distinct identical messages sent close together', () => {
  const first = message({ id: 'first', firstSeenAt: 1000, lastUpdatedAt: 1100 });
  const repeated = message({ id: 'second', firstSeenAt: 1500, lastUpdatedAt: 1600 });
  const result = deduplicateConversationMessages([first, repeated]);
  assert.equal(result.length, 2);
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
