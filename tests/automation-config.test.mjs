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

const variablesUrl = await compile('../lib/variables.ts', [
  ["from 'liquidjs'", `from '${import.meta.resolve('liquidjs')}'`],
]);
const validationUrl = await compile('../lib/automation-validation.ts');
const configUrl = await compile('../lib/automation-config.ts', [
  ["from './automation-validation'", `from '${validationUrl}'`],
  ["from './variables'", `from '${variablesUrl}'`],
]);
const { validateAutomationConfig, buildAutomationStartPayload } = await import(configUrl);

const variable = { id: 'global:prenom', name: 'prenom', type: 'static', value: 'Marie', scope: 'global', updatedAt: 0 };
const draft = (overrides = {}) => ({
  messages: [' Bonjour {{prenom}} ', 'Au revoir'],
  interval: '30',
  unit: 'seconds',
  repeatCount: '2',
  timeWindowEnabled: true,
  startTime: '09:00',
  endTime: '18:00',
  variables: [variable],
  ...overrides,
});

test('validates and normalizes an automation draft into runtime units', () => {
  const result = validateAutomationConfig(draft());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.config.messages, ['Bonjour {{prenom}}', 'Au revoir']);
  assert.equal(result.config.intervalMs, 30_000);
  assert.equal(result.config.repeatMode, 'finite');
  assert.equal(result.config.repeatCount, 2);
});

test('builds the runtime start payload from validated configuration', () => {
  const result = validateAutomationConfig(draft({ repeatCount: '0' }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(buildAutomationStartPayload(result.config), {
    type: 'CHAT_AUTOMATION_START',
    messages: ['Bonjour {{prenom}}', 'Au revoir'],
    variables: [variable],
    intervalMs: 30_000,
    repeatMode: 'infinite',
    repeatCount: 0,
    timeWindowEnabled: true,
    startTime: '09:00',
    endTime: '18:00',
  });
});

test('reports empty messages, unknown variables and malformed token syntax', () => {
  assert.equal(validateAutomationConfig(draft({ messages: ['   '] })).code, 'sequenceEmpty');
  const unknown = validateAutomationConfig(draft({ messages: ['Bonjour {{inconnue}}'] }));
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.code, 'unknownVariables');
    assert.deepEqual(unknown.names, ['inconnue']);
    assert.equal(unknown.messageIndex, 1);
  }
  assert.equal(validateAutomationConfig(draft({ messages: ['Bonjour {{'] })).code, 'invalidVariableSyntax');
  assert.equal(validateAutomationConfig(draft({ messages: ['Bonjour {{}}'] })).code, 'invalidVariableSyntax');
});

test('accepts Liquid filters and control tags in message templates', () => {
  const filtered = validateAutomationConfig(draft({ messages: ['Bonjour {{ prenom | capitalize }}'] }));
  assert.equal(filtered.ok, true);
  const conditional = validateAutomationConfig(draft({
    messages: ['{% if prenom %}Bonjour {{ prenom }}{% else %}Bonjour{% endif %}'],
  }));
  assert.equal(conditional.ok, true);
});

test('rejects invalid interval, repeat count and identical enabled window', () => {
  assert.equal(validateAutomationConfig(draft({ interval: '0' })).code, 'invalidInterval');
  assert.equal(validateAutomationConfig(draft({ repeatCount: '-1' })).code, 'invalidRepeatCount');
  assert.equal(validateAutomationConfig(draft({ startTime: '09:00', endTime: '09:00' })).code, 'invalidTimeWindow');
});

test('rejects malformed clock values and excessively long sequences', () => {
  assert.equal(validateAutomationConfig(draft({ startTime: '25:00' })).code, 'invalidSettings');
  assert.equal(validateAutomationConfig(draft({ messages: ['x'.repeat(1_000_001)] })).code, 'sequenceTooLong');
});

test('rejects malformed draft shapes before normalization', () => {
  assert.equal(validateAutomationConfig(draft({ unit: 'hours' })).code, 'invalidSettings');
  assert.equal(validateAutomationConfig(draft({ timeWindowEnabled: 'yes' })).code, 'invalidSettings');
  assert.equal(validateAutomationConfig(draft({ messages: null })).code, 'invalidSettings');
  assert.equal(validateAutomationConfig(draft({ messages: ['ok', 42] })).code, 'invalidSettings');
  assert.equal(validateAutomationConfig(draft({ messages: Array(1) })).code, 'invalidSettings');
  assert.equal(validateAutomationConfig(draft({ variables: null })).code, 'invalidSettings');
  assert.equal(validateAutomationConfig(draft({ variables: [{ ...variable, value: 42 }] })).code, 'invalidSettings');
  assert.equal(validateAutomationConfig(draft({ variables: Array(1) })).code, 'invalidSettings');
});

test('sanitizes variable definitions before returning runtime configuration', () => {
  const untrusted = { ...variable, injected: 'x'.repeat(2_000_000) };
  const result = validateAutomationConfig(draft({ variables: [untrusted] }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.config.variables, [variable]);
  assert.equal('injected' in result.config.variables[0], false);
  assert.deepEqual(buildAutomationStartPayload(result.config).variables, [variable]);
});
