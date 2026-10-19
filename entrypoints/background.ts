import type { DiagnosticEvent } from '../lib/contracts';
import {
  backgroundMarkInterruptedMessagesIncomplete,
  backgroundUpsertConversationMessage,
  backgroundClearSiteHistory,
} from '../lib/history';
import { isValidConversationMessage } from '../lib/history-validation';
import { isValidDiagnosticEvent, limitDiagnosticEvents } from '../lib/diagnostic-validation';
import { isSenderOriginAllowed } from '../lib/message-origin-validation';

const LOG_KEY = 'chatAutomationLogs';
const CONTENT_SCRIPT_ID = 'chat-automation-all-sites';
const CONTENT_SCRIPT_MATCHES = ['http://*/*', 'https://*/*'];

async function registerContentScriptForAllSites(): Promise<void> {
  const registered = await browser.scripting.getRegisteredContentScripts();
  const legacyIds = registered.filter(script => script.id !== CONTENT_SCRIPT_ID).map(script => script.id);
  if (legacyIds.length > 0) await browser.scripting.unregisterContentScripts({ ids: legacyIds });
  const existing = registered.some(script => script.id === CONTENT_SCRIPT_ID);
  if (existing) return;
  await browser.scripting.registerContentScripts([{
    id: CONTENT_SCRIPT_ID,
    matches: CONTENT_SCRIPT_MATCHES,
    js: ['/content-scripts/content.js'],
    runAt: 'document_idle',
    persistAcrossSessions: true,
  }]);
}

let logWriteQueue: Promise<void> = Promise.resolve();

function isExtensionUiSender(sender: { id?: string; tab?: unknown; url?: string }): boolean {
  return sender.id === browser.runtime.id
    && !sender.tab
    && typeof sender.url === 'string'
    && sender.url.startsWith(browser.runtime.getURL('/'));
}

function persistDiagnosticEvent(entry: DiagnosticEvent): Promise<{ ok: boolean }> {
  const write = logWriteQueue.then(async () => {
    const stored = await browser.storage.local.get(LOG_KEY);
    const previous = limitDiagnosticEvents(stored[LOG_KEY]);
    await browser.storage.local.set({ [LOG_KEY]: limitDiagnosticEvents([...previous, entry]) });
  });
  logWriteQueue = write.catch(() => undefined);
  return write.then(() => ({ ok: true })).catch(error => {
    console.error('[Chat Automation] Écriture du journal échouée dans le background.', error);
    return { ok: false };
  });
}

export default defineBackground(() => {
  const registerAllSites = () => {
    void registerContentScriptForAllSites().catch(error =>
      console.error('[Chat Automation] Enregistrement du script global impossible.', error),
    );
  };
  browser.runtime.onInstalled.addListener(registerAllSites);
  browser.runtime.onStartup.addListener(registerAllSites);
  registerAllSites();

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return undefined;

    // Destructive storage actions are accepted only from this extension's own UI.
    if (isExtensionUiSender(sender) && message.type === 'CHAT_HISTORY_CLEAR_SITE' && 'origin' in message && typeof message.origin === 'string') {
      let origin: string;
      try {
        const parsed = new URL(message.origin);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== message.origin) return { ok: false };
        origin = parsed.origin;
      } catch {
        return { ok: false };
      }
      return (async () => {
        // Suppress current DOM contents first. Any upserts already in flight are then
        // ordered ahead of the deletion in the shared history write queue.
        try {
          const tabs = await browser.tabs.query({ url: `${origin}/*` });
          await Promise.all(tabs.filter(tab => tab.id !== undefined).map(tab =>
            browser.tabs.sendMessage(tab.id!, { type: 'CHAT_HISTORY_CLEARED', origin }).catch(() => undefined),
          ));
        } catch (error) {
          console.warn('[Chat Automation] Notification des onglets avant effacement impossible.', error);
        }
        await backgroundClearSiteHistory(origin);
        return { ok: true };
      })().catch(error => {
        console.error('[Chat Automation] Effacement de l’historique impossible.', error);
        return { ok: false };
      });
    }

    if (isExtensionUiSender(sender) && message.type === 'CHAT_LOGS_CLEAR') {
      const operation = logWriteQueue.then(() => browser.storage.local.remove(LOG_KEY));
      logWriteQueue = operation.catch(error => {
        console.error('[Chat Automation] Effacement des journaux impossible.', error);
      });
      return operation.then(() => ({ ok: true })).catch(() => ({ ok: false }));
    }
    if (message.type === 'CHAT_AUTOMATION_LOG_EVENT' && 'entry' in message) {
      if (!isValidDiagnosticEvent(message.entry)) return { ok: false };
      if (!isSenderOriginAllowed(sender.tab?.url, message.entry.site)) return { ok: false };
      return persistDiagnosticEvent(message.entry)
        .then(result => result)
        .catch(() => ({ ok: false }));
    }
    if (message.type === 'CHAT_HISTORY_UPSERT' && 'message' in message) {
      if (!isValidConversationMessage(message.message)) return { ok: false };
      if (!isSenderOriginAllowed(sender.tab?.url, message.message.origin)) return { ok: false };
      return backgroundUpsertConversationMessage(message.message)
        .then(() => ({ ok: true }))
        .catch(error => {
          console.error('[Chat Automation] Écriture de l’historique échouée dans le background.', error);
          return { ok: false };
        });
    }
    if (message.type === 'CHAT_HISTORY_MARK_INTERRUPTED' && 'origin' in message && typeof message.origin === 'string') {
      if (!isSenderOriginAllowed(sender.tab?.url, message.origin)) return { ok: false };
      return backgroundMarkInterruptedMessagesIncomplete(message.origin)
        .then(() => ({ ok: true }))
        .catch(error => {
          console.error('[Chat Automation] Réconciliation de l’historique échouée dans le background.', error);
          return { ok: false };
        });
    }
    return undefined;
  });
});
