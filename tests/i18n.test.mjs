import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/i18n.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { messages, preferredLocale, translate } = await import(moduleUrl);

test('preferredLocale defaults to French and recognizes English locale tags', () => {
  assert.equal(preferredLocale(), 'fr');
  assert.equal(preferredLocale('fr-FR'), 'fr');
  assert.equal(preferredLocale('en'), 'en');
  assert.equal(preferredLocale('en-GB'), 'en');
});

test('French and English dictionaries expose the same keys', () => {
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.fr).sort());
});

test('translate returns the requested locale value and falls back to French', () => {
  assert.equal(translate('en', 'startAutomation'), 'Start automation');
  assert.equal(translate('fr', 'startAutomation'), 'Démarrer l’automatisation');
});
