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
const previewUrl = await compile('../lib/template-preview.ts', [
  ["from './variables'", `from '${variablesUrl}'`],
]);
const { previewMessageTemplate } = await import(previewUrl);
const variable = { id: 'global:prenom', name: 'prenom', type: 'static', value: 'marie', scope: 'global', updatedAt: 0 };

test('renders static variables and Liquid filters with the shared template engine', async () => {
  const result = await previewMessageTemplate('Bonjour {{ prenom | capitalize }}', [variable]);
  assert.equal(result.text, 'Bonjour Marie');
  assert.deepEqual(result.unknownVariables, []);
});

test('shows dynamic paths as placeholders without requiring runtime data', async () => {
  const result = await previewMessageTemplate('Ticket {{ data.ticket }}', [variable]);
  assert.equal(result.text, 'Ticket [data.ticket]');
  assert.deepEqual(result.unknownVariables, []);
});

test('preserves unknown variables visibly and reports them separately', async () => {
  const result = await previewMessageTemplate('Bonjour {{ inconnu }}', [variable]);
  assert.equal(result.text, 'Bonjour {{inconnu}}');
  assert.deepEqual(result.unknownVariables, ['inconnu']);
});

test('reports malformed Liquid syntax through the shared resolver', async () => {
  await assert.rejects(previewMessageTemplate('{% if prenom %}Bonjour', [variable]), /Syntaxe de template Liquid invalide/);
});
