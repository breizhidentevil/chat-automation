import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const variablesUrl = `data:text/javascript;base64,${Buffer.from(
  ts.transpile(
    (await readFile(new URL('../lib/variables.ts', import.meta.url), 'utf8')),
    { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  ).replace("from 'liquidjs'", `from '${import.meta.resolve('liquidjs')}'`),
).toString('base64')}`;
const source = await readFile(new URL('../lib/conversation-simulator.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 })
  .replace("from './variables'", `from '${variablesUrl}'`);
const { simulateConversation } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const variable = (name, value) => ({ id: name, name, type: 'static', value, scope: 'automation', updatedAt: 0 });

test('simulates ordered sent/expected-received pairs deterministically', async () => {
  const result = await simulateConversation([
    { id: 1, sent: 'Bonjour {{ prenom | capitalize }}', expected: 'Bonjour !' },
    { id: 2, sent: 'Quel est le statut ?', expected: 'Votre commande est en route.' },
  ], [variable('prenom', 'marie')]);
  assert.equal(result.successful, 2);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.pairs.map(pair => pair.renderedSent), ['Bonjour Marie', 'Quel est le statut ?']);
  assert.deepEqual(result.pairs.map(pair => pair.expected), ['Bonjour !', 'Votre commande est en route.']);
});

test('reports template errors for a pair without stopping later pairs', async () => {
  const result = await simulateConversation([
    { id: 1, sent: '{{ missing }}', expected: 'Réponse simulée' },
    { id: 2, sent: 'Message valide', expected: 'Réponse suivante' },
  ], []);
  assert.equal(result.failed, 1);
  assert.equal(result.successful, 1);
  assert.match(result.pairs[0].error, /Variable\(s\) inconnue\(s\)/);
  assert.equal(result.pairs[1].renderedSent, 'Message valide');
});

test('rejects an empty conversation or incomplete pair', async () => {
  await assert.rejects(simulateConversation([], []), /Ajoutez au moins une paire/);
  await assert.rejects(simulateConversation([{ id: 1, sent: 'Bonjour', expected: ' ' }], []), /paire 1/);
});

test('does not contact a real LLM or send messages', async () => {
  const result = await simulateConversation([{ id: 1, sent: 'Question', expected: 'Réponse prédéfinie' }], []);
  assert.equal(result.pairs[0].expected, 'Réponse prédéfinie');
  assert.equal(result.pairs[0].status, 'ok');
});
