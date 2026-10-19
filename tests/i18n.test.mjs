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

test('history truncation message matches the per-message storage limit', () => {
  assert.match(messages.fr.truncated, /100 000/);
  assert.match(messages.en.truncated, /100,000/);
  assert.doesNotMatch(messages.fr.truncated, /20 000/);
  assert.doesNotMatch(messages.en.truncated, /20,000/);
});

test('newly centralized popup messages are present in both locales', () => {
  const keys = [
    'logsReadError', 'historyExportStarted', 'historyExportError',
    'variablesReadError', 'settingsReadError', 'automationStatusReadError',
    'settingsSaveError', 'variablesSaveError', 'siteAccessDenied',
    'siteAccessEnabled', 'siteAccessEnabledScriptLoaded', 'siteAccessError',
    'testMessageRequired', 'testConfirm', 'testRunning', 'testInconclusive',
    'pageScriptUnavailable', 'sequenceTooLong', 'unknownVariables',
    'invalidVariableSyntax', 'invalidSettings', 'pageScriptUnreachable',
    'waiting', 'phaseReady', 'phaseCountdown', 'phaseWaitingWindow',
    'phaseSending', 'phaseFinished', 'phaseFailed', 'phaseStopped',
    'logsExportStarted', 'logsExportError', 'mainNavigation', 'siteAccess',
    'enableOnSite',
  ];
  for (const key of keys) {
    assert.equal(typeof messages.fr[key], 'string', `Missing French translation: ${key}`);
    assert.equal(typeof messages.en[key], 'string', `Missing English translation: ${key}`);
  }
});
