import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../entrypoints/content/index.ts', import.meta.url), 'utf8');

test('confirmation and validation diagnostics do not persist message text', () => {
  assert.doesNotMatch(source, /function messageLogPreview/);
  assert.doesNotMatch(source, /expectedPreview/);
  assert.doesNotMatch(source, /message confirmé=|Message attendu=/);
  assert.match(source, /message-confirmation-match-found', `messageLength=\$\{text\.length\}/);
  assert.match(source, /strategy-validation-confirmation-wait-started', `messageLength=\$\{text\.length\}/);
});

test('confirmation timeout records candidate lengths, not visible conversation excerpts', () => {
  const timeoutStart = source.indexOf("'message-confirmation-timeout'");
  const timeoutLog = source.slice(timeoutStart - 1800, timeoutStart + 500);
  assert.ok(timeoutStart >= 0);
  assert.match(timeoutLog, /recentCandidateLengths/);
  assert.doesNotMatch(timeoutLog, /recentMessageCandidates/);
  assert.doesNotMatch(timeoutLog, /innerText[^\n]*slice\(0, 120\)/);
});
