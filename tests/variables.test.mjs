import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/variables.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const {
  findTemplateVariables,
  resolveMessageTemplate,
  validateTemplateVariables,
} = await import(moduleUrl);

const context = {
  iteration: 3,
  messageIndex: 2,
  timestamp: new Date('2026-01-02T03:04:05.000Z'),
};

const variable = (name, value, scope = 'automation') => ({
  id: name,
  name,
  type: 'static',
  value,
  scope,
  updatedAt: 0,
});

test('findTemplateVariables returns unique names in first-seen order', () => {
  assert.deepEqual(
    findTemplateVariables('{{first}} / {{second}} / {{first}}'),
    ['first', 'second'],
  );
});

test('validation accepts global and current-scope variables only', () => {
  const variables = [
    variable('globalValue', 'G', 'global'),
    variable('localValue', 'L', 'automation'),
    variable('otherValue', 'O', 'otherScope'),
  ];
  assert.deepEqual(
    validateTemplateVariables('{{globalValue}} {{localValue}} {{otherValue}} {{missing}}', variables),
    ['otherValue', 'missing'],
  );
});

test('automation-scope values override global values with the same name', async () => {
  const result = await resolveMessageTemplate(
    'Value={{shared}}',
    [variable('shared', 'global', 'global'), variable('shared', 'local', 'automation')],
    context,
  );
  assert.equal(result.text, 'Value=local');
  assert.deepEqual(result.variablesUsed, ['shared']);
});

test('dynamic paths resolve nested properties, array indexes and runtime context', async () => {
  const result = await resolveMessageTemplate(
    '{{data.items[1].label}} / {{automation.sequence.iteration}} / {{automation.message.index}}',
    [],
    context,
    'automation',
    { data: { items: [{ label: 'first' }, { label: 'second' }] } },
  );
  assert.equal(result.text, 'second / 3 / 2');
});

test('unknown static variables fail with an actionable error', async () => {
  await assert.rejects(
    resolveMessageTemplate('Hello {{missing}}', [], context),
    /Variable\(s\) inconnue\(s\)/,
  );
});

test('malformed template braces are rejected', async () => {
  await assert.rejects(
    resolveMessageTemplate('Hello {{name', [variable('name', 'World')], context),
    /Syntaxe de variable invalide/,
  );
});

test('prototype-related path segments are blocked', async () => {
  await assert.rejects(
    resolveMessageTemplate('{{data.constructor}}', [], context, 'automation', { data: {} }),
    /Segment de chemin interdit/,
  );
  await assert.rejects(
    resolveMessageTemplate('{{data.__proto__}}', [], context, 'automation', { data: {} }),
    /Segment de chemin interdit/,
  );
});

test('dynamic paths cannot read inherited object properties', async () => {
  await assert.rejects(
    resolveMessageTemplate('{{data.toString}}', [], context, 'automation', { data: {} }),
    /Propriété « toString » introuvable/,
  );
});

test('dynamic array indexes outside the available range fail explicitly', async () => {
  await assert.rejects(
    resolveMessageTemplate('{{data.items[2]}}', [], context, 'automation', { data: { items: ['only'] } }),
    /Index hors limites/,
  );
});
