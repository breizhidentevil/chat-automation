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

test('rejects array containers and whitespace-only site/event identifiers', () => {
  assert.equal(isValidDiagnosticEvent([]), false);
  assert.equal(isValidDiagnosticEvent(Object.assign([], event())), false);
  assert.equal(isValidDiagnosticEvent(event({ site: '   ' })), false);
  assert.equal(isValidDiagnosticEvent(event({ event: '\t\n' })), false);
});


test('diagnostic history respects count and aggregate text budgets while retaining recent events', async () => {
  const { limitDiagnosticEvents, MAX_TOTAL_DIAGNOSTIC_CHARACTERS } = await import(moduleUrl);
  const events = Array.from({ length: 200 }, (_, index) => event({
    timestamp: index + 1,
    event: `event_${index}`,
    details: 'x'.repeat(10_000),
  }));
  const limited = limitDiagnosticEvents(events);
  assert.ok(limited.length <= 500);
  assert.ok(limited.length < events.length);
  assert.equal(limited.at(-1)?.timestamp, 200);
  const estimatedSize = limited.reduce((total, item) =>
    total + item.site.length + item.event.length + (item.details?.length ?? 0) + (item.strategy?.length ?? 0) + 128, 0);
  assert.ok(estimatedSize <= MAX_TOTAL_DIAGNOSTIC_CHARACTERS);
});
