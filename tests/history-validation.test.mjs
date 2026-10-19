import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/history-validation.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { isValidConversationMessage } = await import(moduleUrl);

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

test('accepts a valid conversation message', () => {
  assert.equal(isValidConversationMessage(message()), true);
});

test('rejects invalid origin schemes and non-origin URLs', () => {
  assert.equal(isValidConversationMessage(message({ origin: 'javascript:alert(1)' })), false);
  assert.equal(isValidConversationMessage(message({ origin: 'https://example.com/path' })), false);
});

test('rejects missing fields and unsupported enum values', () => {
  assert.equal(isValidConversationMessage(message({ conversationId: '' })), false);
  assert.equal(isValidConversationMessage(message({ role: 'admin' })), false);
  assert.equal(isValidConversationMessage(message({ status: 'pending' })), false);
  assert.equal(isValidConversationMessage(message({ source: 'network' })), false);
});

test('rejects oversized content and identifiers', () => {
  assert.equal(isValidConversationMessage(message({ content: 'x'.repeat(500_001) })), false);
  assert.equal(isValidConversationMessage(message({ id: 'x'.repeat(513) })), false);
});

test('rejects invalid or inconsistent timestamps', () => {
  assert.equal(isValidConversationMessage(message({ firstSeenAt: Number.NaN })), false);
  assert.equal(isValidConversationMessage(message({ firstSeenAt: 2000, lastUpdatedAt: 1000 })), false);
  assert.equal(isValidConversationMessage(message({ status: 'complete', completedAt: 900 })), false);
});
