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
const { resolveMessageTemplate } = await import(moduleUrl);

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

test('LiquidJS filters work with existing static variables', async () => {
  const result = await resolveMessageTemplate(
    'Bonjour {{ name | capitalize }} — {{ missing | default: "à vous" }}',
    [variable('name', 'marie')],
    context,
  );
  assert.equal(result.text, 'Bonjour Marie — à vous');
});

test('LiquidJS conditionals branch on dynamic automation context', async () => {
  const result = await resolveMessageTemplate(
    '{% if automation.sequence.iteration > 1 %}Suite{% else %}Début{% endif %}',
    [],
    context,
  );
  assert.equal(result.text, 'Suite');
});

test('LiquidJS loops render arrays from dynamic data', async () => {
  const result = await resolveMessageTemplate(
    '{% for item in data.items %}{{ forloop.index }}. {{ item.name | upcase }}{% unless forloop.last %}; {% endunless %}{% endfor %}',
    [],
    context,
    'automation',
    { data: { items: [{ name: 'alpha' }, { name: 'beta' }] } },
  );
  assert.equal(result.text, '1. ALPHA; 2. BETA');
});

test('legacy custom and dynamic path tokens remain compatible', async () => {
  const result = await resolveMessageTemplate(
    '{{ greeting }} {{data.items[0].name}} / {{automation.sequence.iteration}}',
    [variable('greeting', 'Salut')],
    context,
    'automation',
    { data: { items: [{ name: 'test' }] } },
  );
  assert.equal(result.text, 'Salut test / 3');
  assert.deepEqual(result.variablesUsed, ['greeting', 'data.items[0].name', 'automation.sequence.iteration']);
});

test('unknown legacy variables still fail with an actionable error', async () => {
  await assert.rejects(
    resolveMessageTemplate('Hello {{missing}}', [], context),
    /Variable\(s\) inconnue\(s\)/,
  );
});

test('malformed Liquid delimiters are rejected', async () => {
  await assert.rejects(
    resolveMessageTemplate('Hello {{ name', [variable('name', 'World')], context),
    /Syntaxe de variable invalide/,
  );
});

test('LiquidJS cannot access inherited properties or prototype-related paths', async () => {
  await assert.rejects(
    resolveMessageTemplate('{{data.constructor}}', [], context, 'automation', { data: {} }),
    /Segment de chemin interdit/,
  );
  await assert.rejects(
    resolveMessageTemplate('{{data.toString}}', [], context, 'automation', { data: {} }),
    /Propriété « toString » introuvable/,
  );
});
