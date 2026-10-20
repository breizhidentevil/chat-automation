import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/automation-validation.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { isValidAutomationStartMessage, sanitizeSavedAutomationSettings } = await import(moduleUrl);

function config(overrides = {}) {
  return {
    messages: ['Hello', 'How are you?'],
    intervalMs: 5_000,
    repeatMode: 'finite',
    repeatCount: 3,
    startTime: '09:00',
    endTime: '17:00',
    timeWindowEnabled: true,
    ...overrides,
  };
}

test('accepts valid finite and infinite automation settings', () => {
  assert.equal(isValidAutomationStartMessage(config()), true);
  assert.equal(isValidAutomationStartMessage(config({ repeatMode: 'infinite', repeatCount: 0 })), true);
  assert.equal(isValidAutomationStartMessage(config({ timeWindowEnabled: false, startTime: '00:00', endTime: '00:00' })), true);
});

test('rejects malformed message sequences', () => {
  assert.equal(isValidAutomationStartMessage(null), false);
  assert.equal(isValidAutomationStartMessage([]), false);
  assert.equal(isValidAutomationStartMessage(config({ messages: [] })), false);
  const sparseMessages = Array(2);
  sparseMessages[1] = 'Hello';
  assert.equal(isValidAutomationStartMessage(config({ messages: sparseMessages })), false);
  assert.equal(isValidAutomationStartMessage(config({ messages: ['   '] })), false);
  assert.equal(isValidAutomationStartMessage(config({ messages: Array(101).fill('x') })), false);
  assert.equal(isValidAutomationStartMessage(config({ messages: ['x'.repeat(100_001)] })), false);
  assert.equal(isValidAutomationStartMessage(config({ messages: Array(11).fill('x'.repeat(100_000)) })), false);
});

test('rejects invalid intervals and repeat configuration', () => {
  for (const intervalMs of [999, 31 * 24 * 60 * 60 * 1_000 + 1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    assert.equal(isValidAutomationStartMessage(config({ intervalMs })), false);
  }
  assert.equal(isValidAutomationStartMessage(config({ repeatMode: 'finite', repeatCount: 0 })), false);
  assert.equal(isValidAutomationStartMessage(config({ repeatMode: 'infinite', repeatCount: 2 })), false);
  assert.equal(isValidAutomationStartMessage(config({ repeatCount: -1 })), false);
  assert.equal(isValidAutomationStartMessage(config({ repeatCount: Number.MAX_SAFE_INTEGER + 1 })), false);
});

test('rejects malformed time windows', () => {
  for (const startTime of ['9:00', '24:00', '12:60', 'noon']) {
    assert.equal(isValidAutomationStartMessage(config({ startTime })), false);
  }
  assert.equal(isValidAutomationStartMessage(config({ endTime: '25:00' })), false);
  assert.equal(isValidAutomationStartMessage(config({ timeWindowEnabled: 'yes' })), false);
  assert.equal(isValidAutomationStartMessage(config({ startTime: '09:00', endTime: '09:00', timeWindowEnabled: true })), false);
});


test('sanitizes malformed persisted automation settings and enforces aggregate limits', () => {
  assert.equal(sanitizeSavedAutomationSettings(null), null);
  assert.equal(sanitizeSavedAutomationSettings([]), null);

  const sanitized = sanitizeSavedAutomationSettings({
    message: 'fallback',
    messages: ['ok', '', 12, 'x'.repeat(100_001), 'y'.repeat(100_000), 'z'.repeat(100_000)],
    interval: '-1',
    unit: 'minutes',
    repeatMode: 'finite',
    repeatCount: 'not-a-number',
    timeWindowEnabled: true,
    startTime: '25:00',
    endTime: '25:00',
  });

  assert.ok(sanitized);
  assert.deepEqual(sanitized.messages, ['ok', 'y'.repeat(100_000), 'z'.repeat(100_000)]);
  assert.equal(sanitized.interval, '30');
  assert.equal(sanitized.unit, 'minutes');
  assert.equal(sanitized.repeatMode, 'infinite');
  assert.equal(sanitized.repeatCount, '0');
  assert.equal(sanitized.startTime, '09:00');
  assert.notEqual(sanitized.startTime, sanitized.endTime);
  assert.equal(sanitized.messages.reduce((total, item) => total + item.length, 0) <= 1_000_000, true);
});
