import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../entrypoints/content/index.ts', import.meta.url), 'utf8');

test('re-checks automation identity after async template preparation before sending', () => {
  const buildData = source.indexOf('const dynamicData = await buildDynamicVariableData(config, timestamp);');
  const afterBuildGuard = source.indexOf('if (activeAutomation !== config) return;', buildData);
  const resolveTemplate = source.indexOf('const resolved = await resolveMessageTemplate(', buildData);
  const afterResolveGuard = source.indexOf('if (activeAutomation !== config) return;', resolveTemplate);
  const sendCall = source.indexOf('const result = await sendText(text, { requireSavedStrategy: true, automationConfig: config });');
  const beforeSendGuard = source.lastIndexOf('if (activeAutomation !== config) return;', sendCall);

  assert.ok(buildData >= 0 && afterBuildGuard > buildData && afterBuildGuard < resolveTemplate);
  assert.ok(resolveTemplate > afterBuildGuard && afterResolveGuard > resolveTemplate && afterResolveGuard < sendCall);
  assert.ok(beforeSendGuard > afterResolveGuard && beforeSendGuard < sendCall);
});

test('re-checks cancellation after insertion/logging and immediately before the send action', () => {
  const insertedLog = source.indexOf("await logEvent(origin, 'INFO', 'text-inserted'");
  const postInsertGuard = source.indexOf('if (siteAccessRevoked || (options.automationConfig && activeAutomation !== options.automationConfig))', insertedLog);
  const buttonClick = source.indexOf('button.click();', insertedLog);
  const beforeButtonGuard = source.lastIndexOf('if (siteAccessRevoked || (options.automationConfig && activeAutomation !== options.automationConfig))', buttonClick);
  const enterDispatch = source.indexOf("chosen.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter'", buttonClick);
  const beforeEnterGuard = source.lastIndexOf('if (siteAccessRevoked || (options.automationConfig && activeAutomation !== options.automationConfig))', enterDispatch);

  assert.ok(insertedLog >= 0 && postInsertGuard > insertedLog && postInsertGuard < buttonClick);
  assert.ok(beforeButtonGuard > postInsertGuard && beforeButtonGuard < buttonClick);
  assert.ok(enterDispatch > buttonClick && beforeEnterGuard > buttonClick && beforeEnterGuard < enterDispatch);
});
