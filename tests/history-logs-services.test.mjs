import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = async (path, replacements = []) => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let output = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
  for (const [from, to] of replacements) output = output.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
};
const historyValidationUrl = await compile('../lib/history-validation.ts');
const historyUrl = await compile('../lib/history.ts', [
  ["from './history-validation'", `from '${historyValidationUrl}'`],
]);
const diagnosticValidationUrl = await compile('../lib/diagnostic-validation.ts');
const variablesServiceUrl = await compile('../services/variables-storage.ts', [
  ["from '../lib/variables'", "data:text/javascript,export const VARIABLES_STORAGE_KEY='chatAutomationVariables';export const filterValidVariableDefinitions=(value)=>Array.isArray(value)?value.filter(item=>item&&typeof item.name==='string'):[];"],
]);
const historyServiceUrl = await compile('../services/history-service.ts', [
  ["from '../lib/history'", `from '${historyUrl}'`],
  ["from '../lib/history-validation'", `from '${historyValidationUrl}'`],
  ["from './variables-storage'", `from '${variablesServiceUrl}'`],
]);
const logsServiceUrl = await compile('../services/logs-service.ts', [
  ["from '../lib/diagnostic-validation'", `from '${diagnosticValidationUrl}'`],
  ["from './variables-storage'", `from '${variablesServiceUrl}'`],
]);
const { loadVisibleHistory } = await import(historyServiceUrl);
const { loadRecentLogs } = await import(logsServiceUrl);

const message = (overrides = {}) => ({
  id: 'm1', conversationId: 'https://example.test/chat', origin: 'https://example.test',
  role: 'user', content: 'Hello', contentTruncated: false, status: 'complete',
  firstSeenAt: 100, lastUpdatedAt: 100, source: 'dom', ...overrides,
});
const log = (timestamp, overrides = {}) => ({
  timestamp, level: 'INFO', site: 'https://example.test', event: 'test', ...overrides,
});

test('history service scopes to the exact conversation and returns newest first', async () => {
  const origin = 'https://example.test';
  const current = message();
  const other = message({ id: 'm2', conversationId: 'https://example.test/other', content: 'Other', firstSeenAt: 200, lastUpdatedAt: 200 });
  const result = await loadVisibleHistory(async key => ({ [key]: [current, other] }), origin, current.conversationId);
  assert.deepEqual(result.map(item => item.id), ['m1']);
});

test('history service falls back to site history when the SPA URL no longer matches', async () => {
  const origin = 'https://example.test';
  const result = await loadVisibleHistory(async key => ({ [key]: [message(), message({ id: 'm2', content: 'Second', firstSeenAt: 200, lastUpdatedAt: 200 })] }), origin, 'https://example.test/new-route');
  assert.deepEqual(result.map(item => item.id), ['m2', 'm1']);
});

test('logs service filters malformed events and returns newest first within its limit', async () => {
  const result = await loadRecentLogs(async key => ({ [key]: [log(1), { timestamp: 'bad' }, log(2), log(3)] }), 2);
  assert.deepEqual(result.map(item => item.timestamp), [3, 2]);
});
