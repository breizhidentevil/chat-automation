import { detectCandidates, findSendButton, stableSelector } from '../../lib/detector';
import { logEvent } from '../../lib/logger';
import { getProcedure, saveProcedure } from '../../lib/procedures';
import type { Candidate, ChatSiteProcedure } from '../../lib/contracts';
import { markInterruptedMessagesIncomplete, readConversationHistory, upsertConversationMessage, type ConversationMessage, type ConversationRole } from '../../lib/history';
import { filterValidVariableDefinitions, resolveMessageTemplate, type VariableDefinition } from '../../lib/variables';
import type { DiagnosticEvent } from '../../lib/contracts';
import { isValidDiagnosticEvent } from '../../lib/diagnostic-validation';
import { isValidAutomationStartMessage } from '../../lib/automation-validation';

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  runAt: 'document_idle',
  main() {
    void startConversationHistoryObserver();
    browser.runtime.onMessage.addListener(async (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return undefined;
      if (message.type === 'CHAT_AUTOMATION_PING') {
        if (siteAccessRevoked) {
          siteAccessRevoked = false;
          void startConversationHistoryObserver();
        }
        return { ready: true, origin: location.origin };
      }
      if (message.type === 'CHAT_AUTOMATION_PERMISSION_REVOKED') {
        siteAccessRevoked = true;
        stopAutomation('stopped', 'Accès au site révoqué : automatisation et capture de l’historique arrêtées.');
        historyObserver?.disconnect();
        historyObserver = undefined;
        if (historyScanTimer !== undefined) window.clearTimeout(historyScanTimer);
        historyScanTimer = undefined;
        return { ok: true };
      }
      if (message.type === 'CHAT_AUTOMATION_STOP') {
        stopAutomation();
        return { message: 'Automatisation arrêtée.' };
      }
      if (message.type === 'CHAT_AUTOMATION_VALIDATE') {
        if (!('text' in message) || typeof message.text !== 'string' || !message.text.trim()) return { message: 'Saisissez le message de test. Aucun changement n’a été effectué.' };
        return validateAndSaveStrategy(message.text);
      }
      if (message.type === 'CHAT_AUTOMATION_START') {
        if (!isValidAutomationStartMessage(message)) {
          return { message: 'Paramètres d’automatisation invalides.' };
        }
        const procedure = await getProcedure(location.origin);
        if (!procedure) return { message: 'Aucune stratégie validée n’est enregistrée pour ce site. Allez dans Détection et validez une stratégie avant de démarrer.' };
        const variables = filterValidVariableDefinitions('variables' in message ? message.variables : []);
        startAutomation({ messages: message.messages.map(item => item.trim()), variables, intervalMs: message.intervalMs, repeatMode: message.repeatMode, repeatCount: message.repeatCount, timeWindowEnabled: message.timeWindowEnabled, startTime: message.startTime, endTime: message.endTime });
        return { message: `Automatisation démarrée avec ${message.messages.length} message(s) par séquence et la stratégie enregistrée « ${procedure.sendStrategy.method} ». Gardez la page ouverte.` };
      }
      if ((message.type !== 'CHAT_AUTOMATION_SEND' && message.type !== 'CHAT_AUTOMATION_TICK') || !('text' in message) || typeof message.text !== 'string') return undefined;
      return sendText(message.text);
    });
  },
});

async function sendText(
  rawText: string,
  options: { requireSavedStrategy?: boolean; automationConfig?: AutomationConfig } = {},
): Promise<{ message: string; success: boolean }> {
  const text = rawText.trim();
  if (!text) return { message: 'Le message est vide.', success: false };
  const origin = location.origin;
  await logEvent(origin, 'INFO', 'send-request-received');

  const procedure = await getProcedure(origin);
  if (options.requireSavedStrategy && !procedure) {
    await logEvent(origin, 'ERROR', 'automation-blocked-no-validated-strategy');
    return { message: 'Aucune stratégie validée n’est enregistrée pour ce site. Ouvrez Détection et validez une stratégie avant de démarrer l’automatisation.', success: false };
  }

  let chosen: HTMLElement | undefined;
  if (procedure) {
    try {
      const node = document.querySelector<HTMLElement>(procedure.inputSelector);
      if (node && node.isConnected && node.getClientRects().length > 0 && !node.matches(':disabled, [readonly]') && isEditable(node)) {
        chosen = node;
        await logEvent(origin, 'INFO', 'saved-procedure-input-found', procedure.inputSelector, { strategy: 'saved-procedure' });
      } else {
        await logEvent(origin, 'ERROR', 'saved-procedure-input-stale', procedure.inputSelector, { strategy: 'saved-procedure' });
        if (options.requireSavedStrategy) return { message: 'Le champ de la stratégie enregistrée n’est plus valide. Automatisation suspendue ; relancez la validation de stratégie.', success: false };
      }
    } catch {
      await logEvent(origin, 'ERROR', 'saved-procedure-selector-invalid', undefined, { strategy: 'saved-procedure' });
      if (options.requireSavedStrategy) return { message: 'Le sélecteur du champ enregistré est invalide. Automatisation suspendue ; relancez la validation de stratégie.', success: false };
    }
  }

  // Interactive/manual sending may still detect a field. Scheduled automation must never
  // silently substitute a different field or a different sending method.
  if (!chosen && !options.requireSavedStrategy) {
    const start = performance.now();
    const candidates = detectCandidates();
    await logEvent(origin, 'INFO', 'candidate-scan-complete', `candidates=${candidates.length}; topScores=${candidates.slice(0, 4).map(c => c.score).join(',')}`, { strategy: 'semantic-detection', durationMs: Math.round(performance.now() - start) });
    if (candidates.length === 1 || (candidates[0] && candidates[0].score >= 45 && (!candidates[1] || candidates[0].score - candidates[1].score >= 15))) chosen = candidates[0]?.element;
    else chosen = await guidedPick(origin, candidates);
  }
  if (!chosen) {
    await logEvent(origin, 'ERROR', 'input-selection-cancelled-or-timed-out');
    return { message: 'Champ non identifié. Relancez la détection et sélectionnez le champ de chat.', success: false };
  }

  // Snapshot the actual matching DOM nodes, not only a count. Some chat UIs
  // reuse or replace message wrappers between sends, so a count alone can miss
  // the next message (especially when the same prompt is sent twice).
  const baselineMatches = getMatchingMessageElements(text);
  try {
    await insertText(chosen, text);
    await logEvent(origin, 'INFO', 'text-inserted', `element=${chosen.tagName.toLowerCase()}; selector=${procedure?.inputSelector ?? stableSelector(chosen)}`);
  } catch (error) {
    await logEvent(origin, 'ERROR', 'text-insertion-failed', error instanceof Error ? error.message : 'unknown error');
    return { message: 'Le champ a été identifié, mais l’insertion du texte a échoué.', success: false };
  }

  if (procedure) {
    if (procedure.sendStrategy.method === 'button') {
      let button: HTMLElement | null | undefined = null;
      try {
        button = document.querySelector<HTMLElement>(procedure.sendStrategy.selector);
      } catch {
        await logEvent(origin, 'ERROR', 'saved-send-button-selector-invalid', procedure.sendStrategy.selector, { strategy: 'saved-procedure' });
        return { message: 'Le sélecteur du bouton enregistré est invalide. Relancez la validation de stratégie.', success: false };
      }
      if ((!button || !isUsableSendButton(button)) && options.automationConfig) {
        // Pendant la génération, de nombreux chats remplacent temporairement le bouton
        // d’envoi par un bouton d’arrêt. Le sélecteur enregistré reste la seule stratégie
        // autorisée : on attend qu’il redevienne disponible, sans redétecter ni basculer sur Entrée.
        button = await waitForSavedSendButton(procedure.sendStrategy.selector, options.automationConfig);
        if (activeAutomation !== options.automationConfig) {
          return { message: 'Attente du bouton interrompue : automatisation arrêtée.', success: false };
        }
      }
      if (!button || !isUsableSendButton(button)) {
        await logEvent(origin, 'ERROR', 'saved-send-button-unavailable', procedure.sendStrategy.selector, { strategy: 'saved-procedure' });
        return { message: 'Le bouton enregistré est absent ou désactivé. Relancez la validation de stratégie.', success: false };
      }
      button.click();
      await logEvent(origin, 'INFO', 'saved-send-strategy-executed', `method=button; selector=${procedure.sendStrategy.selector}`, { strategy: 'saved-procedure' });
    } else if (procedure.sendStrategy.method === 'enter') {
      chosen.focus();
      chosen.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      chosen.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      chosen.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      await logEvent(origin, 'INFO', 'saved-send-strategy-executed', 'method=enter', { strategy: 'saved-procedure' });
    } else {
      await logEvent(origin, 'ERROR', 'saved-send-strategy-unknown');
      return { message: 'La stratégie enregistrée ne contient pas de méthode d’envoi exploitable. Automatisation suspendue.', success: false };
    }
  } else {
    // Fallback for non-automated send requests only; never used by automation.
    await waitForUiUpdate();
    const button = await waitForEnabledSendButton(chosen, 1800);
    if (button) button.click();
    else {
      chosen.focus();
      chosen.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      chosen.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      chosen.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    }
  }

  const expectedPreview = messageLogPreview(text);
  await logEvent(origin, 'INFO', 'send-confirmation-wait-started', `Message attendu=${JSON.stringify(expectedPreview)}; délai=20000ms; vérification=1s`, { strategy: procedure?.sendStrategy.method ?? 'fallback' });
  const confirmed = await waitForVisibleMessage(text, baselineMatches, 20000);
  if (!confirmed) {
    await logEvent(origin, 'ERROR', 'send-result-unconfirmed', `Message attendu=${JSON.stringify(expectedPreview)}; aucun nouveau message correspondant après 20000ms.`, { strategy: procedure?.sendStrategy.method ?? 'fallback', durationMs: 20000 });
    return { message: 'La méthode a été exécutée, mais aucun nouveau message correspondant n’a été détecté. Automatisation suspendue pour éviter les envois répétés non confirmés.', success: false };
  }

  await logEvent(origin, 'INFO', 'send-result-confirmed-in-dom', `Message attendu=${JSON.stringify(expectedPreview)}; message correspondant observé dans la conversation.`, { strategy: procedure?.sendStrategy.method ?? 'fallback' });
  return { message: 'Message détecté dans la conversation après exécution de la méthode d’envoi.', success: true };
}

async function validateAndSaveStrategy(rawText: string): Promise<{ message: string; validated?: boolean }> {
  const text = rawText.trim();
  const origin = location.origin;
  await logEvent(origin, 'INFO', 'strategy-validation-started', 'Le test va envoyer le texte saisi dans le chat.');

  let input: HTMLElement | undefined;
  const oldProcedure = await getProcedure(origin);
  if (oldProcedure) {
    try {
      const savedInput = document.querySelector<HTMLElement>(oldProcedure.inputSelector);
      if (savedInput && savedInput.isConnected && savedInput.getClientRects().length > 0 && !savedInput.matches(':disabled, [readonly]') && isEditable(savedInput)) input = savedInput;
    } catch { /* selector is stale; fall back to detection */ }
  }
  if (!input) {
    const candidates = detectCandidates();
    if (candidates.length === 1 || (candidates[0] && candidates[0].score >= 45 && (!candidates[1] || candidates[0].score - candidates[1].score >= 15))) input = candidates[0]?.element;
    else input = await guidedPick(origin, candidates);
  }
  if (!input) {
    await logEvent(origin, 'WARN', 'strategy-validation-aborted', 'Aucun champ sélectionné.');
    return { message: 'Validation annulée : aucun champ de chat n’a été sélectionné. Aucune stratégie n’a été enregistrée.', validated: false };
  }

  const inputSelector = stableSelector(input);
  const baselineMatches = getMatchingMessageElements(text);
  let strategy: ChatSiteProcedure['sendStrategy'];
  try {
    await insertText(input, text);
  } catch (error) {
    await logEvent(origin, 'ERROR', 'strategy-validation-insertion-failed', error instanceof Error ? error.message : 'unknown error');
    return { message: 'Échec du test : impossible d’insérer le texte. Aucune stratégie n’a été enregistrée.', validated: false };
  }

  // Do not select the send button before typing: many chat apps keep it
  // disabled/absent until their framework has processed the new text.
  await waitForUiUpdate();
  const button = await waitForEnabledSendButton(input, 1800);
  if (button) {
    const buttonSelector = stableSelector(button);
    strategy = { method: 'button', selector: buttonSelector, confidence: 1 };
    button.click();
  } else {
    strategy = { method: 'enter', confidence: 1 };
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  }

  const expectedPreview = messageLogPreview(text);
  await logEvent(origin, 'INFO', 'strategy-validation-confirmation-wait-started', `Message attendu=${JSON.stringify(expectedPreview)}; délai=20000ms; vérification=1s`, { strategy: strategy.method });
  const confirmed = await waitForVisibleMessage(text, baselineMatches, 20000);
  if (!confirmed) {
    await logEvent(origin, 'WARN', 'strategy-validation-failed', `Message attendu=${JSON.stringify(expectedPreview)}; aucun nouveau message correspondant après 20000ms ; stratégie non sauvegardée.`, { strategy: strategy.method, durationMs: 20000 });
    return { message: 'Test non confirmé : aucun nouveau message correspondant n’a été détecté dans la conversation. La stratégie n’a pas été enregistrée. Vérifiez le résultat sur le site avant de réessayer.', validated: false };
  }

  const existing = await getProcedure(origin);
  const now = Date.now();
  const procedure: ChatSiteProcedure = {
    origin,
    schemaVersion: 2,
    inputSelector,
    sendStrategy: strategy,
    updatedAt: now,
    lastSuccessAt: now,
    successCount: (existing?.successCount ?? 0) + 1,
    failureCount: existing?.failureCount ?? 0,
  };
  await saveProcedure(procedure);
  await logEvent(origin, 'INFO', 'strategy-validation-succeeded-and-saved', `method=${strategy.method}; input=${inputSelector}; message confirmé=${JSON.stringify(expectedPreview)}`, { strategy: strategy.method });
  return { message: `Validation réussie : un nouveau message a été détecté dans la conversation. La stratégie « ${strategy.method === 'button' ? 'bouton d’envoi' : 'Entrée'} » est enregistrée pour ${origin}. Cette preuve concerne l’interface, pas la confirmation du serveur.`, validated: true };
}



/**
 * During LLM generation, the page may temporarily remove or disable the saved send button.
 * Keep the automation paused and check the exact saved selector once per second. This does
 * not redetect the strategy or fall back to Enter. The loop is cancellable by Stop.
 */
async function waitForSavedSendButton(selector: string, config: AutomationConfig): Promise<HTMLElement | undefined> {
  let loggedWaiting = false;
  while (activeAutomation === config) {
    let button: HTMLElement | null;
    try {
      button = document.querySelector<HTMLElement>(selector);
    } catch {
      await logEvent(location.origin, 'ERROR', 'saved-send-button-selector-invalid-during-wait', selector, { strategy: 'saved-procedure' });
      return undefined;
    }
    if (button && isUsableSendButton(button)) {
      if (loggedWaiting) {
        await logEvent(location.origin, 'INFO', 'saved-send-button-available-again', selector, { strategy: 'saved-procedure' });
        publishAutomationStatus('sending', 'Le bouton enregistré est de nouveau disponible. Envoi du message.');
      }
      return button;
    }
    if (!loggedWaiting) {
      loggedWaiting = true;
      await logEvent(location.origin, 'INFO', 'saved-send-button-temporarily-unavailable', 'Pause de l’automatisation ; nouvelle vérification dans 1 seconde.', { strategy: 'saved-procedure' });
    }
    publishAutomationStatus('waiting-llm', 'Bouton d’envoi indisponible : attente de la fin de la réflexion du LLM. Nouvelle vérification dans 1 seconde.');
    await new Promise(resolve => window.setTimeout(resolve, 1000));
  }
  return undefined;
}

function isUsableSendButton(button: HTMLElement): boolean {
  return button.isConnected && button.getClientRects().length > 0 && !button.matches(':disabled, [aria-disabled="true"]');
}

function waitForUiUpdate(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function waitForEnabledSendButton(input: HTMLElement, timeoutMs: number): Promise<HTMLElement | undefined> {
  const deadline = performance.now() + timeoutMs;
  do {
    const button = findSendButton(input);
    if (button && isUsableSendButton(button)) return button;
    await new Promise(resolve => window.setTimeout(resolve, 100));
  } while (performance.now() < deadline);
  return undefined;
}

function messageLogPreview(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 180 ? `${normalized.slice(0, 180)}… [tronqué, ${normalized.length} caractères au total]` : normalized;
}

function normalizedText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const USER_MESSAGE_SELECTORS = [
  '[data-message-author-role="user"]',
  '[data-author="user"]',
  '[data-role="user"]',
  '[data-testid*="user-message"]',
  '[data-testid*="conversation-turn"]',
  '[data-message-id]',
  '[data-testid*="message"]',
  'article',
  '[role="listitem"]',
].join(',');

function isVisibleElement(element: HTMLElement): boolean {
  return element.isConnected && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
}

function isEditableOrControl(element: HTMLElement): boolean {
  return Boolean(element.closest('input, textarea, [contenteditable="true"], [role="textbox"], button, [role="button"]'));
}

function getMatchingMessageElements(text: string): HTMLElement[] {
  const expected = normalizedText(text);
  if (!expected) return [];

  // Prefer common message/turn containers used by chat interfaces. Exact text
  // matching is retained to avoid confirming a different message by substring.
  const preferred = Array.from(document.querySelectorAll<HTMLElement>(USER_MESSAGE_SELECTORS))
    .filter(element => isVisibleElement(element) && !isEditableOrControl(element))
    .filter(element => normalizedText(element.innerText || element.textContent || '') === expected);

  // Always include common generic text/message containers, even when one preferred
  // selector already matched an older copy of the same prompt. Previously, the
  // presence of that older match disabled fallback scanning and could hide a second
  // message rendered with a different DOM structure.
  const generic = Array.from(document.body.querySelectorAll<HTMLElement>(
    'p, div, article, li, section, [role="listitem"], [role="article"], [data-testid*="message"], [data-testid*="turn"], [data-message-id]'
  ))
    .filter(element => isVisibleElement(element) && !isEditableOrControl(element))
    .filter(element => normalizedText(element.innerText || element.textContent || '') === expected);
  const candidates = [...new Set([...preferred, ...generic])];

  return candidates.filter(element => {
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (!(parent instanceof HTMLElement) || isEditableOrControl(parent)) continue;
      if (normalizedText(parent.innerText || parent.textContent || '') === expected && candidates.includes(parent)) return false;
    }
    return true;
  });
}

function waitForVisibleMessage(text: string, baselineMatches: HTMLElement[], timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    let done = false;
    let lastCount = baselineMatches.length;
    const baselineNodes = new Set(baselineMatches);
    const expectedPreview = text.length > 180 ? `${text.slice(0, 180)}…` : text;
    const startedAt = performance.now();
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      observer.disconnect();
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      resolve(value);
    };
    const check = () => {
      const matches = getMatchingMessageElements(text);
      lastCount = matches.length;
      const newlyRenderedMatch = matches.some(element => !baselineNodes.has(element));
      if (newlyRenderedMatch || lastCount > baselineMatches.length) {
        void logEvent(location.origin, 'INFO', 'message-confirmation-match-found', `expected="${expectedPreview}"; matchesBefore=${baselineMatches.length}; matchesNow=${lastCount}; newNode=${newlyRenderedMatch}; elapsedMs=${Math.round(performance.now() - startedAt)}`);
        finish(true);
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    const intervalId = window.setInterval(check, 1000);
    const timeoutId = window.setTimeout(() => {
      const diagnostics = Array.from(document.querySelectorAll<HTMLElement>(USER_MESSAGE_SELECTORS))
        .filter(element => isVisibleElement(element) && !isEditableOrControl(element))
        .slice(-8)
        .map(element => normalizedText(element.innerText || element.textContent || '').slice(0, 120))
        .filter(Boolean);
      void logEvent(location.origin, 'WARN', 'message-confirmation-timeout', `expected="${expectedPreview}"; matchesBefore=${baselineMatches.length}; matchesAtTimeout=${lastCount}; elapsedMs=${Math.round(performance.now() - startedAt)}; recentMessageCandidates=${JSON.stringify(diagnostics)}`);
      finish(false);
    }, timeoutMs);
    check();
  });
}

// --- Conversation history capture -------------------------------------------------
// Capture is independent from automation. Messages are written as provisional while
// they stream, updated in place, and finalized after the UI indicates generation has
// stopped and the content has remained stable.
const HISTORY_MESSAGE_SELECTORS = [
  '[data-message-author-role="user"]',
  '[data-message-author-role="assistant"]',
  '[data-author="user"]', '[data-author="assistant"]',
  '[data-role="user"]', '[data-role="assistant"]',
  '[data-message-type="user"]', '[data-message-type="assistant"]',
  '[data-testid*="user-message"]', '[data-testid*="assistant-message"]',
  '[data-testid*="user-query"]', '[data-testid*="model-response"]',
  '[data-testid*="conversation-turn"]',
  '[data-message-id]',
  '[class*="message-content"]', '[class*="messageContent"]',
  '[class*="message-bubble"]', '[class*="chat-message"]',
  '[class*="response-content"]', '[class*="markdown"]',
  'article', '[role="listitem"]',
].join(',');

const historyElementIds = new WeakMap<HTMLElement, string>();
const historyFirstSeen = new WeakMap<HTMLElement, number>();
const historyLastContent = new WeakMap<HTMLElement, string>();
const historyLastChanged = new WeakMap<HTMLElement, number>();
const historyElementRoles = new WeakMap<HTMLElement, ConversationRole>();
let historyScanTimer: number | undefined;
let historyObserver: MutationObserver | undefined;
let historyPollTimer: number | undefined;
let siteAccessRevoked = false;
let historyScanBusy = false;
let historyClaimedExisting = new Set<string>();
let historyKnownEntries: ConversationMessage[] = [];
let historyLastRoute = `${location.pathname}${location.search}${location.hash}`;
let historyLastLoggedCandidateState: 'none' | 'found' | undefined;

function historyNormalize(value: string): string {
  return value.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '').replace(/[\u00A0\u202F]/g, ' ').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

function historyRoleFor(element: HTMLElement): ConversationRole {
  const roleNodes: HTMLElement[] = [element];
  let parent = element.parentElement;
  for (let depth = 0; parent && depth < 4; depth++, parent = parent.parentElement) roleNodes.push(parent);
  for (const node of roleNodes) {
    const values = [
      node.getAttribute('data-message-author-role'), node.getAttribute('data-author'),
      node.getAttribute('data-role'), node.getAttribute('data-message-type'),
      node.getAttribute('aria-label'), node.getAttribute('data-testid'), node.className,
    ].filter((value): value is string => typeof value === 'string').join(' ').toLowerCase();
    if (/\b(user|human)\b|user-message|user-query|human-message/.test(values)) return 'user';
    if (/\b(assistant|ai|model)\b|assistant-message|model-response|ai-message/.test(values)) return 'assistant';
    if (/\bsystem\b|system-message/.test(values)) return 'system';
  }
  // Many interfaces mark a whole turn but identify the author on a descendant.
  const nestedRole = element.querySelector<HTMLElement>('[data-message-author-role], [data-author], [data-role], [data-message-type]');
  if (nestedRole && nestedRole !== element) return historyRoleFor(nestedRole);
  return 'unknown';
}

function historyElementText(element: HTMLElement): string {
  // innerText reflects the rendered conversation and excludes most hidden templates.
  return historyNormalize(element.innerText || element.textContent || '');
}

function historyIsCandidate(element: HTMLElement): boolean {
  if (!element.isConnected || !element.getClientRects().length) return false;
  if (getComputedStyle(element).visibility === 'hidden' || getComputedStyle(element).display === 'none') return false;
  if (element.closest('input, textarea, [contenteditable="true"], [role="textbox"], button, [role="button"]')) return false;
  if (element.matches('script, style, noscript, nav, header, footer')) return false;
  return historyElementText(element).length > 0;
}

function historyMessageCandidates(): Array<{ element: HTMLElement; role: ConversationRole; content: string }> {
  const toCandidate = (element: HTMLElement) => ({ element, role: historyRoleFor(element), content: historyElementText(element) });
  const primary = Array.from(document.querySelectorAll<HTMLElement>(HISTORY_MESSAGE_SELECTORS))
    .filter(historyIsCandidate)
    .map(toCandidate)
    .filter(item => item.content.length > 0 && item.content.length <= 20_000);

  // If the site has no recognizable author attributes, retain structurally plausible
  // message blocks with role=unknown instead of silently recording nothing. Restrict
  // the fallback to the main conversation area and avoid whole-page/container nodes.
  let raw = primary;
  const roots = Array.from(document.querySelectorAll<HTMLElement>('main, [role="main"], [class*="conversation"], [class*="chat-history"]'))
    .filter(historyIsCandidate);
  const root = roots.sort((a, b) => historyElementText(a).length - historyElementText(b).length)[0];
  if (root) {
    const fallbackNodes = Array.from(root.querySelectorAll<HTMLElement>(
      'article, [role="article"], [role="listitem"], p, li, [data-message-id], [class*="message"], [class*="turn"], [data-testid*="conversation"]'
    )).filter(historyIsCandidate).map(toCandidate)
      .filter(item => item.content.length > 0 && item.content.length <= 20_000);
    if (fallbackNodes.length > 0) raw = [...raw, ...fallbackNodes];
  }

  // Prefer explicitly tagged nodes. Remove wrapper duplicates when a nested candidate
  // carries the same role; for unlabelled sites, prefer the smaller nested text block
  // so an entire transcript is not stored as one giant message.
  const hasExplicitRoleMarker = (element: HTMLElement) => element.matches(
    '[data-message-author-role], [data-author], [data-role], [data-message-type], [data-testid*="user-message"], [data-testid*="assistant-message"], [data-testid*="user-query"], [data-testid*="model-response"]',
  );
  const unique = new Map<HTMLElement, { element: HTMLElement; role: ConversationRole; content: string }>();
  for (const item of raw) unique.set(item.element, item);
  const candidates = [...unique.values()];
  const filtered = candidates.filter(item => {
    if (item.role === 'unknown' && candidates.some(other => other.role !== 'unknown' && other.element !== item.element && other.element.contains(item.element))) return false;
    return !candidates.some(other => {
      if (other.element === item.element || !item.element.contains(other.element)) return false;
      if (item.role !== 'unknown' && other.role !== item.role) return false;
      if (hasExplicitRoleMarker(other.element) && !hasExplicitRoleMarker(item.element)) return true;
      return item.role === 'unknown' && other.content.length > 0 && other.content.length < item.content.length;
    });
  });
  // Some chat UIs render the same user turn in multiple sibling containers (for
  // example an accessible copy plus a visual bubble). Collapse only candidates
  // with identical role/text whose rendered rectangles substantially overlap.
  const geometricallyDeduplicated: typeof filtered = [];
  for (const item of filtered) {
    const rect = item.element.getBoundingClientRect();
    const duplicate = geometricallyDeduplicated.some(other => {
      if (other.role !== item.role || other.content !== item.content) return false;
      const otherRect = other.element.getBoundingClientRect();
      const left = Math.max(rect.left, otherRect.left);
      const top = Math.max(rect.top, otherRect.top);
      const right = Math.min(rect.right, otherRect.right);
      const bottom = Math.min(rect.bottom, otherRect.bottom);
      const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
      const smallerArea = Math.min(Math.max(1, rect.width * rect.height), Math.max(1, otherRect.width * otherRect.height));
      return intersection / smallerArea >= 0.65;
    });
    if (!duplicate) geometricallyDeduplicated.push(item);
  }
  return geometricallyDeduplicated;
}

function stableHistoryId(element: HTMLElement, role: ConversationRole, content: string, conversationId: string): string {
  const cached = historyElementIds.get(element);
  if (cached) return cached;
  const domId = element.getAttribute('data-message-id') || element.getAttribute('data-id');
  const id = domId ? `${conversationId}::${role}::${domId}` : `dom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  historyElementIds.set(element, id);
  historyFirstSeen.set(element, Date.now());
  historyLastContent.set(element, content);
  historyLastChanged.set(element, Date.now());
  historyElementRoles.set(element, role);
  return id;
}

async function startConversationHistoryObserver(): Promise<void> {
  try {
    await markInterruptedMessagesIncomplete(location.origin);
    historyKnownEntries = await readConversationHistory(location.origin);
  } catch (error) {
    console.warn('[Chat Automation] Initialisation de l’historique impossible', error);
  }
  if (siteAccessRevoked) return;
  historyObserver?.disconnect();
  if (historyPollTimer !== undefined) window.clearInterval(historyPollTimer);
  historyObserver = new MutationObserver(() => scheduleHistoryScan());
  historyObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-message-author-role', 'data-author', 'data-role', 'data-testid', 'aria-label', 'class'] });
  scanConversationHistory();
  historyPollTimer = window.setInterval(() => {
    if (siteAccessRevoked) return;
    if (historyLastRoute !== `${location.pathname}${location.search}${location.hash}`) {
      historyLastRoute = `${location.pathname}${location.search}${location.hash}`;
      historyClaimedExisting = new Set<string>();
      void readConversationHistory(location.origin).then(items => { historyKnownEntries = items; scanConversationHistory(); });
    } else {
      scanConversationHistory();
    }
  }, 1000);
}

function scheduleHistoryScan(): void {
  if (siteAccessRevoked) return;
  if (historyScanTimer !== undefined) window.clearTimeout(historyScanTimer);
  historyScanTimer = window.setTimeout(() => { scanConversationHistory(); }, 300);
}

function scanConversationHistory(): void {
  if (siteAccessRevoked) return;
  if (historyScanBusy || !document.body) return;
  historyScanBusy = true;
  try {
    const conversationId = `${location.origin}${location.pathname}${location.search}${location.hash}`;
    const candidates = historyMessageCandidates();
    const candidateState = candidates.length > 0 ? 'found' : 'none';
    if (candidateState !== historyLastLoggedCandidateState) {
      historyLastLoggedCandidateState = candidateState;
      void logEvent(location.origin, candidateState === 'found' ? 'INFO' : 'WARN', candidateState === 'found' ? 'history-dom-capture-active' : 'history-dom-no-message-candidates',
        candidateState === 'found'
          ? `Candidats=${candidates.length}; rôles=${JSON.stringify(candidates.reduce<Record<string, number>>((counts, item) => { counts[item.role] = (counts[item.role] ?? 0) + 1; return counts; }, {}))}; route=${location.pathname}`
          : `Aucun bloc de message reconnu sur ${location.pathname}. Capture réessayée à la prochaine mutation/polling.`);
    }
    const now = Date.now();
    const isGenerating = isLlmGenerating();
    const claimedThisScan = new Set<string>();

    for (const candidate of candidates) {
      const { element, role, content } = candidate;
      let id = historyElementIds.get(element);
      if (!id) {
        const reusable = historyKnownEntries.find(entry =>
          !claimedThisScan.has(entry.id)
          && entry.conversationId === conversationId
          && entry.role === role
          && entry.content === content
          && entry.status !== 'streaming'
        );
        if (reusable) {
          id = reusable.id;
          historyElementIds.set(element, id);
          historyFirstSeen.set(element, reusable.firstSeenAt);
          historyLastContent.set(element, content);
          historyLastChanged.set(element, now);
          historyElementRoles.set(element, role);
        } else {
          id = stableHistoryId(element, role, content, conversationId);
        }
      }
      claimedThisScan.add(id);

      const previousContent = historyLastContent.get(element);
      if (previousContent !== content) {
        historyLastContent.set(element, content);
        historyLastChanged.set(element, now);
      }
      const lastChanged = historyLastChanged.get(element) ?? now;
      const isAssistant = role === 'assistant';
      const stable = now - lastChanged >= 1800;
      const status = role === 'user' || role === 'system'
        ? 'complete'
        : isAssistant && isGenerating
          ? 'streaming'
          : stable
            ? 'complete'
            : 'streaming';

      const message: ConversationMessage = {
        id,
        conversationId,
        origin: location.origin,
        role,
        content: content.slice(0, 20_000),
        contentTruncated: content.length > 20_000,
        status,
        firstSeenAt: historyFirstSeen.get(element) ?? now,
        lastUpdatedAt: now,
        source: 'dom',
        ...(status === 'complete' ? { completedAt: now } : {}),
      };
      const old = historyKnownEntries.find(entry => entry.id === id);
      // Avoid a storage write on every polling tick when the message did not change.
      if (!old || old.content !== message.content || old.status !== message.status || old.lastUpdatedAt < (historyLastChanged.get(element) ?? now)) {
        void upsertConversationMessage(message);
        const existingIndex = historyKnownEntries.findIndex(entry => entry.id === id);
        if (existingIndex >= 0) historyKnownEntries[existingIndex] = message;
        else historyKnownEntries.push(message);
      }
    }
    historyClaimedExisting = claimedThisScan;
  } catch (error) {
    console.warn('[Chat Automation] Capture de l’historique interrompue', error);
  } finally {
    historyScanBusy = false;
  }
}

type AutomationConfig = { messages: string[]; variables: VariableDefinition[]; intervalMs: number; repeatMode: 'infinite' | 'finite'; repeatCount: number; timeWindowEnabled: boolean; startTime: string; endTime: string };
let automationTimer: number | undefined;
let activeAutomation: AutomationConfig | undefined;
let messageIndex = 0;
let completedSequences = 0;

type AutomationPhase = 'stopped' | 'ready' | 'waiting-interval' | 'waiting-window' | 'waiting-llm' | 'sending' | 'finished' | 'failed';

function publishAutomationStatus(phase: AutomationPhase, note: string, nextSendAt?: number, configOverride?: AutomationConfig): void {
  const config = configOverride ?? activeAutomation;
  void browser.storage.local.set({
    chatAutomationRuntimeStatus: {
      phase,
      note,
      messageIndex: config ? Math.min(messageIndex, Math.max(0, config.messages.length - 1)) : messageIndex,
      messagesCount: config?.messages.length ?? 0,
      completedSequences,
      repeatMode: config?.repeatMode ?? 'finite',
      repeatCount: config?.repeatCount ?? completedSequences,
      nextSendAt: typeof nextSendAt === 'number' ? nextSendAt : null,
      updatedAt: Date.now(),
    },
  }).catch(() => undefined);
}

function stopAutomation(phase: AutomationPhase = 'stopped', note = 'Automatisation arrêtée.'): void {
  const previousConfig = activeAutomation;
  if (automationTimer !== undefined) window.clearTimeout(automationTimer);
  automationTimer = undefined;
  activeAutomation = undefined;
  publishAutomationStatus(phase, note, undefined, previousConfig);
}

function parseClock(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return 0;
  return Math.min(1439, Number(match[1]) * 60 + Number(match[2]));
}

function isInsideWindow(config: AutomationConfig, date = new Date()): boolean {
  if (!config.timeWindowEnabled) return true;
  const now = date.getHours() * 60 + date.getMinutes();
  const start = parseClock(config.startTime), end = parseClock(config.endTime);
  if (start === end) return true;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function msUntilWindow(config: AutomationConfig): number {
  if (!config.timeWindowEnabled) return 0;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const start = parseClock(config.startTime), end = parseClock(config.endTime);
  if (start === end || (start < end ? current >= start && current < end : current >= start || current < end)) return 0;
  const target = new Date(now.getTime());
  target.setHours(Math.floor(start / 60), start % 60, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

function startAutomation(config: AutomationConfig): void {
  stopAutomation();
  activeAutomation = config;
  messageIndex = 0;
  completedSequences = 0;
  void logEvent(location.origin, 'INFO', 'automation-started', `messages=${config.messages.length}; intervalMs=${config.intervalMs}; mode=${config.repeatMode}; sequenceIterations=${config.repeatCount}; timeWindowEnabled=${config.timeWindowEnabled}; window=${config.timeWindowEnabled ? `${config.startTime}-${config.endTime}` : 'disabled'}`);
  publishAutomationStatus('ready', 'Séquence démarrée.');
  scheduleAutomationTick(0);
}

async function buildDynamicVariableData(config: AutomationConfig, timestamp: Date): Promise<Record<string, unknown>> {
  const origin = location.origin;
  const [historyMessages, storage, procedure] = await Promise.all([
    readConversationHistory(origin),
    browser.storage.local.get([
      'chatAutomationLogs',
      'chatAutomationRuntimeStatus',
      'chatAutomationSettings',
      'chatAutomationData',
    ]),
    getProcedure(origin),
  ]);

  const chronological = historyMessages.slice().sort((a, b) => a.firstSeenAt - b.firstSeenAt);
  const toRecord = (message: ConversationMessage, index: number) => ({
    ...message,
    index,
    direction: message.role === 'user' ? 'sent' : message.role === 'assistant' ? 'received' : 'unknown',
    author: message.role === 'user' ? 'self' : message.role === 'assistant' ? 'remote' : 'unknown',
    timestamp: new Date(message.firstSeenAt).toISOString(),
  });
  const messages = chronological.map(toRecord);
  const sent = messages.filter(message => message.direction === 'sent').map((message, index) => ({ ...message, index }));
  const received = messages.filter(message => message.direction === 'received').map((message, index) => ({ ...message, index }));
  const logs = (Array.isArray(storage.chatAutomationLogs) ? storage.chatAutomationLogs.filter(isValidDiagnosticEvent) : [])
    .filter(item => item.site === origin)
    .map((item, index) => ({ ...item, index, message: item.details ?? item.event, timestamp: new Date(item.timestamp).toISOString() }));
  const dataStore = storage.chatAutomationData && typeof storage.chatAutomationData === 'object'
    ? storage.chatAutomationData as Record<string, unknown>
    : {};
  const runtime = storage.chatAutomationRuntimeStatus && typeof storage.chatAutomationRuntimeStatus === 'object'
    ? storage.chatAutomationRuntimeStatus as Record<string, unknown>
    : {};
  const settings = storage.chatAutomationSettings && typeof storage.chatAutomationSettings === 'object'
    ? storage.chatAutomationSettings as Record<string, unknown>
    : {};
  const strategy = procedure ? {
    detection: { status: 'validated', valid: true },
    site: { origin, domain: location.hostname },
    input: { selector: procedure.inputSelector },
    send: {
      method: procedure.sendStrategy.method,
      button_selector: procedure.sendStrategy.method === 'button' ? procedure.sendStrategy.selector : '',
    },
    procedure: { updated_at: new Date(procedure.updatedAt).toISOString(), success_count: procedure.successCount, failure_count: procedure.failureCount },
  } : {
    detection: { status: 'missing', valid: false },
    site: { origin, domain: location.hostname },
    input: { selector: '' },
    send: { method: 'unknown', button_selector: '' },
    procedure: { updated_at: '', success_count: 0, failure_count: 0 },
  };
  const automationMessages = config.messages.map((content, index) => ({ content, index }));
  const currentUrl = location.href;
  const title = document.title;
  const chat = {
    session: { id: chronological.at(-1)?.conversationId ?? currentUrl, title, url: currentUrl, origin, domain: location.hostname },
    messages,
    sent,
    received,
    message: {
      count: messages.length,
      last_sent_content: sent.at(-1)?.content ?? '',
      last_received_content: received.at(-1)?.content ?? '',
      last_sent_timestamp: sent.at(-1)?.timestamp ?? '',
      last_received_timestamp: received.at(-1)?.timestamp ?? '',
      last_sent_author: sent.at(-1)?.author ?? '',
      last_received_author: received.at(-1)?.author ?? '',
    },
  };
  return {
    automation: {
      config: {
        enabled: true,
        interval_ms: config.intervalMs,
        repeat_mode: config.repeatMode,
        repeat_count: config.repeatCount,
        time_window_enabled: config.timeWindowEnabled,
        start_time: config.startTime,
        end_time: config.endTime,
        saved_interval: settings.interval ?? '',
      },
      messages: automationMessages,
      sequence: { iteration: completedSequences + 1, total_iterations: config.repeatMode === 'infinite' ? 0 : config.repeatCount },
      message: { index: messageIndex, total: config.messages.length },
      execution: { status: runtime.phase ?? 'sending', started_at: '', next_run_at: runtime.nextSendAt ?? '' },
    },
    chat,
    history: {
      messages,
      sent,
      received,
      message: { count: messages.length, sent_count: sent.length, received_count: received.length },
      capture: { status: 'active', source: 'dom' },
    },
    logs: {
      events: logs,
      errors: logs.filter(item => item.level === 'ERROR').map((item, index) => ({ ...item, index })),
      warnings: logs.filter(item => item.level === 'WARN').map((item, index) => ({ ...item, index })),
      info: logs.filter(item => item.level === 'INFO').map((item, index) => ({ ...item, index })),
      event: { count: logs.length, last_level: logs.at(-1)?.level ?? '', last_message: logs.at(-1)?.message ?? '', last_timestamp: logs.at(-1)?.timestamp ?? '' },
    },
    strategy,
    data: { records: Array.isArray(dataStore.records) ? dataStore.records : [], source: { name: dataStore.sourceName ?? '' } },
  };
}

function scheduleAutomationTick(delay: number): void {
  const config = activeAutomation;
  if (!config) return;
  const safeDelay = Math.max(0, delay);
  const nextSendAt = Date.now() + safeDelay;
  const outsideWindow = !isInsideWindow(config);
  publishAutomationStatus(
    outsideWindow ? 'waiting-window' : safeDelay > 0 ? 'waiting-interval' : 'ready',
    outsideWindow ? `En attente du créneau ${config.startTime}–${config.endTime}.` : safeDelay > 0 ? 'En attente du prochain envoi.' : 'Prêt à envoyer le prochain message.',
    nextSendAt,
  );
  automationTimer = window.setTimeout(() => { void runAutomationTick(); }, safeDelay);
}

async function runAutomationTick(): Promise<void> {
  const config = activeAutomation;
  if (!config) return;
  if (!isInsideWindow(config)) {
    const wait = msUntilWindow(config);
    publishAutomationStatus('waiting-window', `En attente du créneau ${config.startTime}–${config.endTime}.`, Date.now() + wait);
    scheduleAutomationTick(wait);
    return;
  }

  // LLM interfaces often expose a stop-generation control while the model is responding.
  // If one is present, wait for it to disappear and for the UI to remain idle briefly.
  // The active-config identity also makes this wait cancellable via the Stop button.
  const becameIdle = await waitForLlmIdle(config);
  if (!becameIdle || activeAutomation !== config) return;
  // The response may have finished outside the configured time window.
  if (!isInsideWindow(config)) {
    const wait = msUntilWindow(config);
    publishAutomationStatus('waiting-window', `En attente du créneau ${config.startTime}–${config.endTime}.`, Date.now() + wait);
    scheduleAutomationTick(wait);
    return;
  }

  const currentIndex = messageIndex;
  publishAutomationStatus('sending', `Envoi du message ${currentIndex + 1} sur ${config.messages.length}.`);
  const template = config.messages[currentIndex];
  if (typeof template !== 'string' || !template.trim()) {
    await logEvent(location.origin, 'ERROR', 'automation-invalid-sequence-message', `messageIndex=${currentIndex}`);
    stopAutomation('failed', `Le message ${currentIndex + 1} est vide. Automatisation arrêtée.`);
    return;
  }
  let text: string;
  try {
    const timestamp = new Date();
    const dynamicData = await buildDynamicVariableData(config, timestamp);
    const resolved = await resolveMessageTemplate(
      template,
      config.variables,
      { iteration: completedSequences + 1, messageIndex: currentIndex + 1, timestamp },
      'automation',
      dynamicData,
    );
    text = resolved.text;
    if (resolved.variablesUsed.length > 0) {
      await logEvent(location.origin, 'INFO', 'automation-variables-resolved', `message=${currentIndex + 1}; variables=${resolved.variablesUsed.join(', ')}; iteration=${completedSequences + 1}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Erreur de résolution des variables.';
    await logEvent(location.origin, 'ERROR', 'automation-variable-resolution-failed', `message=${currentIndex + 1}; ${detail}`);
    stopAutomation('failed', `Impossible de résoudre les variables du message ${currentIndex + 1} : ${detail}`);
    return;
  }
  const result = await sendText(text, { requireSavedStrategy: true, automationConfig: config });
  if (activeAutomation !== config) return;
  if (!result.success) {
    await logEvent(location.origin, 'ERROR', 'automation-suspended-strategy-failed', `message=${currentIndex + 1}/${config.messages.length}; ${result.message}`);
    stopAutomation('failed', `Échec au message ${currentIndex + 1}/${config.messages.length} : ${result.message}`);
    return;
  }

  await logEvent(location.origin, 'INFO', 'automation-message-completed', `message=${currentIndex + 1}/${config.messages.length}; ${result.message}`);
  messageIndex += 1;
  if (messageIndex >= config.messages.length) {
    messageIndex = 0;
    completedSequences += 1;
    await logEvent(location.origin, 'INFO', 'automation-sequence-completed', `sequence=${completedSequences}/${config.repeatMode === 'infinite' ? 'infinite' : config.repeatCount}`);
    if (config.repeatMode === 'finite' && completedSequences >= Math.max(1, Math.floor(config.repeatCount))) {
      stopAutomation('finished', `Terminé : ${completedSequences} séquence(s) complète(s).`);
      await logEvent(location.origin, 'INFO', 'automation-finished', `sequenceIterations=${completedSequences}; messagesPerSequence=${config.messages.length}`);
      return;
    }
  }
  scheduleAutomationTick(Math.max(config.intervalMs, msUntilWindow(config)));
}

/**
 * Detects common visible indicators that an LLM is still generating a response.
 * This is necessarily heuristic because each chat website exposes different DOM.
 * If generation is detected, wait until all indicators disappear and the page remains
 * idle for 1.5 seconds. Returns false if automation was stopped while waiting.
 */
async function waitForLlmIdle(config: AutomationConfig): Promise<boolean> {
  const pollMs = 500;
  const idleStableMs = 1500;
  const initiallyBusy = isLlmGenerating();
  if (!initiallyBusy) return activeAutomation === config;

  publishAutomationStatus('waiting-llm', 'En attente de la fin de la génération du LLM.');
  await logEvent(location.origin, 'INFO', 'llm-generation-detected', 'Envoi mis en pause jusqu’à la fin de la génération détectée.');
  let idleSince: number | undefined;
  while (activeAutomation === config) {
    if (isLlmGenerating()) {
      idleSince = undefined;
    } else {
      if (idleSince === undefined) idleSince = Date.now();
      if (Date.now() - idleSince >= idleStableMs) {
        await logEvent(location.origin, 'INFO', 'llm-generation-finished', 'La génération semble terminée ; reprise de la séquence.');
        publishAutomationStatus('ready', 'Génération terminée. Reprise de la séquence.');
        return activeAutomation === config;
      }
    }
    await new Promise(resolve => window.setTimeout(resolve, pollMs));
  }
  return false;
}

function isLlmGenerating(): boolean {
  // Strong signals used by several LLM chat interfaces. Labels are matched in multiple
  // languages; visible-state checks avoid hidden responsive controls causing false pauses.
  const stopSelectors = [
    'button[data-testid*="stop" i]',
    'button[aria-label*="stop generating" i]',
    'button[aria-label*="stop response" i]',
    'button[aria-label*="stop streaming" i]',
    'button[aria-label*="arrêter la génération" i]',
    'button[aria-label*="arrêter la réponse" i]',
    'button[aria-label*="interrompre la génération" i]',
    'button[title*="stop generating" i]',
    'button[title*="arrêter la génération" i]',
  ].join(',');
  try {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(stopSelectors))) {
      if (!element.isConnected || element.getClientRects().length === 0) continue;
      if (element.matches(':disabled, [aria-disabled="true"]')) continue;
      return true;
    }
  } catch { /* Ignore unsupported selector implementations and continue with generic signals. */ }

  // Generic streaming/busy attributes, scoped to the main content area to reduce false positives
  // from unrelated page widgets and background network activity.
  const busySelectors = [
    'main [aria-busy="true"]',
    '[role="main"] [aria-busy="true"]',
    'main [data-is-streaming="true"]',
    '[role="main"] [data-is-streaming="true"]',
    'main [data-streaming="true"]',
    '[role="main"] [data-streaming="true"]',
  ].join(',');
  for (const element of Array.from(document.querySelectorAll<HTMLElement>(busySelectors))) {
    if (element.isConnected && element.getClientRects().length > 0) return true;
  }
  return false;
}

function isEditable(element: HTMLElement): boolean {
  return element.isContentEditable || element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && ['text', 'search', ''].includes(element.type)) || element.getAttribute('role') === 'textbox';
}

function guidedPick(origin: string, candidates: Candidate[]): Promise<HTMLElement | undefined> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);max-width:90vw;padding:12px 16px;background:#202124;color:white;border-radius:10px;font:13px/1.4 system-ui;box-shadow:0 4px 24px #0005;';
    overlay.textContent = candidates.length ? 'Sélection ambiguë : cliquez dans le champ de chat à utiliser. Échap pour annuler.' : 'Champ non détecté : cliquez dans le champ de chat à utiliser. Échap pour annuler.';
    document.documentElement.append(overlay);
    const previousOutline = new WeakMap<HTMLElement, string>();
    const onMove = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || overlay.contains(target)) return;
      if (candidates.some(candidate => candidate.element === target)) return;
      if (!previousOutline.has(target)) previousOutline.set(target, target.style.outline);
      target.style.outline = '2px solid #4f8cff';
    };
    const cleanup = () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousemove', onMove, true);
      overlay.remove();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || overlay.contains(target)) return;
      const editable = target.closest<HTMLElement>('textarea, input:not([type]), input[type="text"], input[type="search"], [contenteditable="true"], [role="textbox"], [aria-multiline="true"]');
      if (!editable || !isEditable(editable) || !editable.isConnected) return;
      event.preventDefault(); event.stopImmediatePropagation();
      cleanup(); editable.focus();
      void logEvent(origin, 'INFO', 'guided-input-selected', `${editable.tagName.toLowerCase()} ${stableSelector(editable)}`);
      resolve(editable);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); cleanup(); resolve(undefined);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousemove', onMove, true);
    window.setTimeout(() => { cleanup(); resolve(undefined); }, 60_000);
  });
}

async function insertText(element: HTMLElement, text: string): Promise<void> {
  element.focus();
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) throw new Error('Native value setter unavailable');
    setter.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (element.isContentEditable || element.getAttribute('role') === 'textbox') {
    const inserted = document.execCommand('insertText', false, text);
    if (!inserted) {
      element.textContent = text;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
    }
    return;
  }
  throw new Error('Unsupported editable element');
}

async function verifySend(input: HTMLElement, originalText: string): Promise<boolean> {
  await new Promise(resolve => window.setTimeout(resolve, 700));
  const value = input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement ? input.value : input.innerText;
  return value.trim() === '' || value.trim() !== originalText.trim();
}
