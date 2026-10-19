import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/message-sequence.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { addMessage, removeMessage, moveMessage, updateMessage } = await import(moduleUrl);

test('adds an empty slot without changing the original sequence', () => {
  const original = ['Bonjour', 'Au revoir'];
  assert.deepEqual(addMessage(original), ['Bonjour', 'Au revoir', '']);
  assert.deepEqual(original, ['Bonjour', 'Au revoir']);
});

test('updates only the requested message', () => {
  const original = ['Bonjour', 'Au revoir'];
  assert.deepEqual(updateMessage(original, 1, 'À bientôt'), ['Bonjour', 'À bientôt']);
  assert.deepEqual(original, ['Bonjour', 'Au revoir']);
});

test('removes a message and preserves the remaining order', () => {
  assert.deepEqual(removeMessage(['A', 'B', 'C'], 1), ['A', 'C']);
});

test('removing the last slot leaves one empty editable message', () => {
  assert.deepEqual(removeMessage(['A'], 0), ['']);
});

test('invalid indexes do not alter multi-message sequences', () => {
  const original = ['A', 'B'];
  assert.deepEqual(updateMessage(original, 8, 'C'), original);
  assert.deepEqual(removeMessage(original, -1), original);
  assert.deepEqual(moveMessage(original, 0, 8), original);
});

test('moves messages in either direction without losing contents', () => {
  assert.deepEqual(moveMessage(['A', 'B', 'C'], 0, 2), ['B', 'C', 'A']);
  assert.deepEqual(moveMessage(['A', 'B', 'C'], 2, 0), ['C', 'A', 'B']);
});

test('same-index moves return the original sequence', () => {
  const original = ['A', 'B'];
  assert.equal(moveMessage(original, 1, 1), original);
});
