import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/procedure-validation.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { isValidChatSiteProcedure } = await import(moduleUrl);

function procedure(overrides = {}) {
  return {
    origin: 'https://example.com',
    schemaVersion: 2,
    inputSelector: 'textarea',
    sendStrategy: { method: 'button', selector: 'button[type="submit"]', confidence: 1 },
    updatedAt: 2000,
    lastSuccessAt: 2000,
    successCount: 1,
    failureCount: 0,
    ...overrides,
  };
}

test('accepts a valid saved procedure', () => {
  assert.equal(isValidChatSiteProcedure(procedure(), 'https://example.com'), true);
});

test('rejects non-origin URLs, mismatched keys and unsupported schemas', () => {
  assert.equal(isValidChatSiteProcedure(procedure({ origin: 'https://example.com/path' } ), 'https://example.com'), false);
  assert.equal(isValidChatSiteProcedure(procedure(), 'https://other.example'), false);
  assert.equal(isValidChatSiteProcedure(procedure({ schemaVersion: 1 })), false);
  assert.equal(isValidChatSiteProcedure(procedure({ origin: 'javascript:alert(1)' })), false);
});

test('rejects invalid selectors, strategies and confidence values', () => {
  assert.equal(isValidChatSiteProcedure(procedure({ inputSelector: '' })), false);
  assert.equal(isValidChatSiteProcedure(procedure({ inputSelector: 'x'.repeat(2049) })), false);
  assert.equal(isValidChatSiteProcedure(procedure({ sendStrategy: { method: 'button', selector: '', confidence: 1 } })), false);
  assert.equal(isValidChatSiteProcedure(procedure({ sendStrategy: { method: 'enter', confidence: 2 } })), false);
  assert.equal(isValidChatSiteProcedure(procedure({ sendStrategy: { method: 'shell', confidence: 1 } })), false);
});

test('rejects invalid counters and timestamps', () => {
  assert.equal(isValidChatSiteProcedure(procedure({ successCount: -1 })), false);
  assert.equal(isValidChatSiteProcedure(procedure({ failureCount: 1.5 })), false);
  assert.equal(isValidChatSiteProcedure(procedure({ updatedAt: Number.NaN })), false);
  assert.equal(isValidChatSiteProcedure(procedure({ lastSuccessAt: 3000 })), false);
});

test('validates ordered fallback selectors and keeps legacy records compatible', () => {
  assert.equal(isValidChatSiteProcedure(procedure({ inputSelectors: ['textarea', 'form textarea'] })), true);
  assert.equal(isValidChatSiteProcedure(procedure({ inputSelectors: ['form textarea'] })), false);
  assert.equal(isValidChatSiteProcedure(procedure({ inputSelectors: ['textarea', 'textarea'] })), false);
  assert.equal(isValidChatSiteProcedure(procedure({ inputSelectors: Array(9).fill('textarea') })), false);
  assert.equal(isValidChatSiteProcedure(procedure()), true);
});

test('validates optional saved input identity fingerprints', () => {
  assert.equal(isValidChatSiteProcedure(procedure({ inputProfile: { tagName: 'textarea', contentEditable: false, placeholder: 'Message' } })), true);
  assert.equal(isValidChatSiteProcedure(procedure({ inputProfile: { tagName: 'TEXTAREA', contentEditable: false } })), false);
  assert.equal(isValidChatSiteProcedure(procedure({ inputProfile: { tagName: 'textarea', contentEditable: 'false' } })), false);
});
