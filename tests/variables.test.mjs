import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/variables.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
}).replace("from 'liquidjs'", `from '${import.meta.resolve('liquidjs')}'`);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const {
  findTemplateVariables,
  filterValidVariableDefinitions,
  isValidVariableDefinition,
  isValidVariableName,
  resolveMessageTemplate,
  validateTemplateVariables,
} = await import(moduleUrl);

const context = {
  iteration: 3,
  messageIndex: 2,
  timestamp: new Date('2026-01-02T03:04:05.000Z'),
};

const variable = (name, value, scope = 'automation') => ({
  id: `${scope}:${name}`,
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


test('variable validation rejects malformed, oversized and duplicate persisted definitions', () => {
  const valid = variable('first', 'value');
  assert.equal(isValidVariableDefinition(valid), true);
  assert.equal(isValidVariableName('__proto__'), false);
  assert.equal(isValidVariableName('normal_name'), true);
  assert.equal(isValidVariableDefinition({ ...valid, updatedAt: Number.NaN }), false);
  assert.equal(isValidVariableDefinition({ ...valid, name: '__proto__' }), false);
  assert.equal(isValidVariableDefinition({ ...valid, value: 'x'.repeat(100_001) }), false);
  assert.deepEqual(
    filterValidVariableDefinitions([
      valid,
      { ...valid, id: valid.id, name: 'second' },
      { ...valid, id: 'second-id' },
      { ...valid, id: 'bad-scope', scope: 'other' },
      null,
    ]).map(item => item.id),
    ['automation:first'],
  );
});

test('template resolution ignores malformed persisted variable definitions', async () => {
  const result = await resolveMessageTemplate(
    'Hello {{name}}',
    [variable('name', 'World'), { id: 'broken', name: 'broken', type: 'static', value: 42, scope: 'global', updatedAt: 0 }],
    context,
  );
  assert.equal(result.text, 'Hello World');
});


test('variable collections are capped by count and aggregate value size', () => {
  const tooMany = Array.from({ length: 101 }, (_, index) => variable(`item_${index}`, 'v'));
  assert.equal(filterValidVariableDefinitions(tooMany).length, 100);

  const oversized = [
    ...Array.from({ length: 11 }, (_, index) => variable(`large_${index}`, 'x'.repeat(100_000))),
    variable('small_after_limit', 'ok'),
  ];
  const filtered = filterValidVariableDefinitions(oversized);
  assert.equal(filtered.length, 10);
  assert.equal(filtered.some(item => item.name === 'large_10'), false);
  assert.equal(filtered.some(item => item.name === 'small_after_limit'), false);
  assert.equal(filtered.reduce((total, item) => total + item.value.length, 0) <= 1_000_000, true);
});

test('resolves nested custom object paths and reports them as known variables', async () => {
  const nested = variable('personne', JSON.stringify({ prenom: 'Alex', adresse: { ville: 'Nantes' } }));
  const result = await resolveMessageTemplate(
    'Bonjour {{personne.prenom}}, ville : {{personne.adresse.ville}}',
    [nested],
    context,
  );
  assert.equal(result.text, 'Bonjour Alex, ville : Nantes');
});


test('supports Liquid default values and standard string filters', async () => {
  const result = await resolveMessageTemplate(
    '{{prenom | default: "Client"}} / {{nom | upcase}} / {{ ville | strip | downcase }}',
    [variable('nom', 'dupont'), variable('ville', ' Nantes ')],
    context,
  );
  assert.equal(result.text, 'Client / DUPONT / nantes');
});
