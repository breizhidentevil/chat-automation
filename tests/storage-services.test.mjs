import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = async (path, replacements = []) => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let output = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
  for (const [from, to] of replacements) output = output.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
};
const variablesUrl = await compile('../lib/variables.ts', [
  ["from 'liquidjs'", `from '${import.meta.resolve('liquidjs')}'`],
]);
const validationUrl = await compile('../lib/automation-validation.ts');
const variableServiceUrl = await compile('../services/variables-storage.ts', [
  ["from '../lib/variables'", `from '${variablesUrl}'`],
]);
const settingsServiceUrl = await compile('../services/automation-settings.ts', [
  ["from '../lib/automation-validation'", `from '${validationUrl}'`],
  ["from './variables-storage'", `from '${variableServiceUrl}'`],
]);
const { loadStoredVariables, saveStoredVariables } = await import(variableServiceUrl);
const { loadAutomationSettings, saveAutomationSettings } = await import(settingsServiceUrl);

test('loads only validated variable definitions', async () => {
  const valid = { id: 'g:name', name: 'name', type: 'static', value: 'Alex', scope: 'global', updatedAt: 1 };
  const result = await loadStoredVariables(async key => ({ [key]: [valid, { name: 'bad' }] }));
  assert.deepEqual(result, [valid]);
});

test('saves a sanitized variable list through the injected storage writer', async () => {
  let written;
  const valid = { id: 'g:name', name: 'name', type: 'static', value: 'Alex', scope: 'global', updatedAt: 1 };
  const result = await saveStoredVariables(async items => { written = items; }, [valid, { name: 'bad' }]);
  assert.deepEqual(result, [valid]);
  assert.deepEqual(written.chatAutomationVariables, [valid]);
});

test('loads and normalizes saved automation settings', async () => {
  const settings = await loadAutomationSettings(async key => ({
    [key]: { message: 'Hello', messages: ['Hello'], interval: '20', unit: 'seconds', repeatCount: '3', timeWindowEnabled: true, startTime: '09:00', endTime: '18:00' },
  }));
  assert.equal(settings?.messages[0], 'Hello');
  assert.equal(settings?.repeatMode, 'finite');
  assert.equal(settings?.repeatCount, '3');
});

test('persists automation settings under the expected storage key', async () => {
  let written;
  const settings = { message: 'Hello', messages: ['Hello'], interval: '20', unit: 'seconds', repeatCount: '3', timeWindowEnabled: true, startTime: '09:00', endTime: '18:00' };
  await saveAutomationSettings(async items => { written = items; }, settings);
  assert.deepEqual(written.chatAutomationSettings, settings);
});
