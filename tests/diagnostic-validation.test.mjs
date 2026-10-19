import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/diagnostic-validation.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { isValidDiagnosticEvent } = await import(moduleUrl);

function event(overrides = {}) {
  return {
    timestamp: 1000,
    level: 'INFO',
    site: 'https://example.com',
    event: 'message_sent',
    details: 'ok',
    strategy: 'button',
    durationMs: 50,
    ...overrides,
  };
}

test('accepts a well-formed diagnostic event', () => {
  assert.equal(isValidDiagnosticEvent(event()), true);
});

test('rejects non-finite or negative timestamps and durations', () => {
  assert.equal(isValidDiagnosticEvent(event({ timestamp: Number.NaN })), false);
  assert.equal(isValidDiagnosticEvent(event({ timestamp: -1 })), false);
  assert.equal(isValidDiagnosticEvent(event({ durationMs: -5 })), false);
  assert.equal(isValidDiagnosticEvent(event({ durationMs: Number.POSITIVE_INFINITY })), false);
});

test('rejects missing, unsupported, or oversized event fields', () => {
  assert.equal(isValidDiagnosticEvent(event({ site: '' })), false);
  assert.equal(isValidDiagnosticEvent(event({ level: 'TRACE' })), false);
  assert.equal(isValidDiagnosticEvent(event({ event: 'x'.repeat(257) })), false);
  assert.equal(isValidDiagnosticEvent(event({ details: 'x'.repeat(10_001) })), false);
  assert.equal(isValidDiagnosticEvent(event({ strategy: 7 })), false);
});
