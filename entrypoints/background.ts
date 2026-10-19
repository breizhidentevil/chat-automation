import type { DiagnosticEvent } from '../lib/contracts';
import {
  backgroundMarkInterruptedMessagesIncomplete,
  backgroundUpsertConversationMessage,
} from '../lib/history';
import { isValidConversationMessage } from '../lib/history-validation';
import { isValidDiagnosticEvent, limitDiagnosticEvents } from '../lib/diagnostic-validation';
import { isSenderOriginAllowed } from '../lib/message-origin-validation';

const LOG_KEY = 'chatAutomationLogs';
let logWriteQueue: Promise<void> = Promise.resolve();

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
  // Remove dynamically registered page scripts as soon as a user revokes a site
  // permission. This keeps the registered-script state aligned with granted access.
  browser.permissions.onRemoved.addListener(({ origins = [] }) => {
    if (origins.length === 0) return;
    void browser.scripting.getRegisteredContentScripts()
      .then(scripts => scripts.filter(script => script.matches?.some(match => origins.includes(match)))
        .map(script => script.id))
      .then(ids => ids.length > 0 ? browser.scripting.unregisterContentScripts({ ids }) : undefined)
      .catch(error => console.error('[Chat Automation] Nettoyage des scripts après révocation impossible.', error));
  });

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return undefined;
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
