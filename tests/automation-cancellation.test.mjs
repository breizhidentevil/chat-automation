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

test('does not let an obsolete preparation failure stop a newer automation run', () => {
  const catchStart = source.indexOf("} catch (error) {", source.indexOf('const dynamicData = await buildDynamicVariableData(config, timestamp);'));
  const catchEnd = source.indexOf('\n  // Do not let a Stop/restart received during async preparation leak into a send.', catchStart);
  const handler = source.slice(catchStart, catchEnd);
  const firstGuard = handler.indexOf('if (activeAutomation !== config) return;');
  const logError = handler.indexOf("await logEvent(location.origin, 'ERROR', 'automation-variable-resolution-failed'");
  const secondGuard = handler.indexOf('if (activeAutomation !== config) return;', firstGuard + 1);
  const stop = handler.indexOf("stopAutomation('failed'");

  assert.ok(catchStart >= 0 && catchEnd > catchStart);
  assert.ok(firstGuard >= 0 && firstGuard < logError);
  assert.ok(secondGuard > logError && secondGuard < stop);
});

test('serializes send requests while the prior send awaits DOM confirmation', () => {
  const lockDeclaration = source.indexOf('let sendInProgress = false;');
  const sendWrapper = source.indexOf('async function sendText(');
  const inFlightCheck = source.indexOf('if (sendInProgress)', sendWrapper);
  const lockSet = source.indexOf('sendInProgress = true;', inFlightCheck);
  const delegatedSend = source.indexOf('return await performSendText(rawText, options);', lockSet);
  const release = source.indexOf('sendInProgress = false;', delegatedSend);
  const actualSend = source.indexOf('async function performSendText(');

  assert.ok(lockDeclaration >= 0 && sendWrapper > lockDeclaration);
  assert.ok(inFlightCheck > sendWrapper && inFlightCheck < lockSet);
  assert.ok(lockSet < delegatedSend && delegatedSend < release);
  assert.ok(release < actualSend);
  assert.match(source.slice(inFlightCheck, lockSet), /send-request-rejected-in-flight/);
});

test('does not mutate sequence cursors after stop/restart during completion logging', () => {
  const completedLog = source.indexOf("'automation-message-completed'");
  const guardAfterMessageLog = source.indexOf('if (activeAutomation !== config) return;', completedLog);
  const cursorIncrement = source.indexOf('messageIndex += 1;', completedLog);
  const sequenceLog = source.indexOf("'automation-sequence-completed'", cursorIncrement);
  const guardAfterSequenceLog = source.indexOf('if (activeAutomation !== config) return;', sequenceLog);
  const finiteDecision = source.indexOf("if (config.repeatMode === 'finite'", sequenceLog);

  assert.ok(completedLog >= 0);
  assert.ok(guardAfterMessageLog > completedLog && guardAfterMessageLog < cursorIncrement);
  assert.ok(cursorIncrement > guardAfterMessageLog);
  assert.ok(sequenceLog > cursorIncrement);
  assert.ok(guardAfterSequenceLog > sequenceLog && guardAfterSequenceLog < finiteDecision);
});
