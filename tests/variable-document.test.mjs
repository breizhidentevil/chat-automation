import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const variablesSource = await readFile(new URL('../lib/variables.ts', import.meta.url), 'utf8');
const variablesCompiled = ts.transpile(variablesSource, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 })
  .replace("from 'liquidjs'", `from '${import.meta.resolve('liquidjs')}'`);
const variablesUrl = `data:text/javascript;base64,${Buffer.from(variablesCompiled).toString('base64')}`;
const source = await readFile(new URL('../lib/variable-document.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 })
  .replace("from './variables'", `from '${variablesUrl}'`);
const { parseVariableDocument, detectVariableDocumentFormat } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('parses flat JSON variable definitions', () => {
  assert.deepEqual(parseVariableDocument('{"prenom":"Alexandre","age":42,"actif":true}'), {
    prenom: 'Alexandre', age: '42', actif: 'true',
  });
  assert.equal(detectVariableDocumentFormat(' { "prenom": "Alex" } '), 'json');
});

test('parses flat YAML mappings, comments, and quoted values', () => {
  assert.deepEqual(parseVariableDocument("prenom: Alexandre\nville: 'Saint-Nazaire'\nphrase: \"bonjour: monde\" # commentaire\n# ignoré"), {
    prenom: 'Alexandre', ville: 'Saint-Nazaire', phrase: 'bonjour: monde',
  });
  assert.equal(detectVariableDocumentFormat('prenom: Alexandre'), 'yaml');
});

test('allows an empty JSON object to clear the variable set', () => {
  assert.deepEqual(parseVariableDocument('{}'), {});
});

test('parses nested JSON and YAML objects and rejects malformed documents', () => {
  assert.throws(() => parseVariableDocument('{"nom invalide":"x"}'), /Nom de variable invalide/);
  assert.deepEqual(parseVariableDocument('{"personne":{"prenom":"Alex","adresse":{"ville":"Nantes"}},"articles":[{"id":1}]}'), {
    personne: '{"prenom":"Alex","adresse":{"ville":"Nantes"}}',
    articles: '[{"id":1}]',
  });
  assert.deepEqual(parseVariableDocument('personne:\\n  prenom: Alex\\n  adresse:\\n    ville: Nantes\\narticles:\\n  premier:\\n    id: 1'), {
    personne: '{"prenom":"Alex","adresse":{"ville":"Nantes"}}',
    articles: '{"premier":{"id":1}}',
  });
  assert.throws(() => parseVariableDocument('prenom: Alex\\nprenom: Sam'), /dupliquée/);
  assert.throws(() => parseVariableDocument('{oops'), /JSON invalide/);
  assert.throws(() => parseVariableDocument('ligne invalide'), /Syntaxe YAML invalide/);
  assert.throws(() => parseVariableDocument('personne:\\n   prenom: Alex'), /multiples de deux/);
});


test('rejects unsafe nested keys and null values at every depth', () => {
  assert.throws(() => parseVariableDocument('{"personne":{"__proto__":{"admin":true}}}'), /Clé imbriquée invalide ou interdite/);
  assert.throws(() => parseVariableDocument('{"personne":{"constructor":"x"}}'), /Clé imbriquée invalide ou interdite/);
  assert.throws(() => parseVariableDocument('{"personne":{"adresse":null}}'), /ne peut pas être nulle/);
  assert.throws(() => parseVariableDocument('{"articles":[{"prototype":"x"}]}'), /Clé imbriquée invalide ou interdite/);
});

test('rejects excessively deep JSON and skipped YAML indentation levels', () => {
  let nested = '"fin"';
  for (let index = 0; index < 14; index += 1) nested = `{"niveau":${nested}}`;
  assert.throws(() => parseVariableDocument(`{"racine":${nested}}`), /profondeur maximale/);
  assert.throws(() => parseVariableDocument('personne:\\n    adresse: Nantes'), /Indentation YAML inattendue/);
});

test('rejects YAML keys that cannot be referenced safely', () => {
  assert.throws(() => parseVariableDocument('personne:\\n  __proto__: x'), /invalide ou interdit/);
  assert.throws(() => parseVariableDocument('personne:\\n  adresse:\\n      ville: Nantes'), /Indentation YAML inattendue/);
});
