import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/message-origin-validation.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { isSenderOriginAllowed } = await import(moduleUrl);

test('accepts a sender URL whose origin matches the claimed origin', () => {
  assert.equal(isSenderOriginAllowed('https://example.com/chat?x=1', 'https://example.com'), true);
  assert.equal(isSenderOriginAllowed('http://example.com:8080/path', 'http://example.com:8080'), true);
});

test('rejects a different claimed origin', () => {
  assert.equal(isSenderOriginAllowed('https://example.com/chat', 'https://attacker.example'), false);
  assert.equal(isSenderOriginAllowed('https://example.com/chat', 'https://example.com.evil.test'), false);
});

test('rejects malformed origins and non-web protocols', () => {
  assert.equal(isSenderOriginAllowed(undefined, 'https://example.com'), false);
  assert.equal(isSenderOriginAllowed('chrome://extensions', 'chrome://extensions'), false);
  assert.equal(isSenderOriginAllowed('file:///tmp/chat.html', 'file://'), false);
  assert.equal(isSenderOriginAllowed('https://example.com', 'https://example.com/path'), false);
  assert.equal(isSenderOriginAllowed('not a url', 'https://example.com'), false);
});
