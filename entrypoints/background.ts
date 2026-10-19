import type { DiagnosticEvent } from '../lib/contracts';
import {
  backgroundMarkInterruptedMessagesIncomplete,
  backgroundUpsertConversationMessage,
  type ConversationMessage,
} from '../lib/history';

const LOG_KEY = 'chatAutomationLogs';
const MAX_LOGS = 500;
let logWriteQueue: Promise<void> = Promise.resolve();

function persistDiagnosticEvent(entry: DiagnosticEvent): Promise<{ ok: boolean }> {
  const write = logWriteQueue.then(async () => {
    const stored = await browser.storage.local.get(LOG_KEY);
    const previous = Array.isArray(stored[LOG_KEY]) ? stored[LOG_KEY] as DiagnosticEvent[] : [];
    await browser.storage.local.set({ [LOG_KEY]: [...previous, entry].slice(-MAX_LOGS) });
  });
  logWriteQueue = write.catch(() => undefined);
  return write.then(() => ({ ok: true })).catch(error => {
    console.error('[Chat Automation] Écriture du journal échouée dans le background.', error);
    return { ok: false };
  });
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return undefined;
    if (message.type === 'CHAT_AUTOMATION_LOG_EVENT' && 'entry' in message) {
      const entry = message.entry as DiagnosticEvent;
      if (!entry || typeof entry.timestamp !== 'number' || typeof entry.site !== 'string' || typeof entry.event !== 'string' || !['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(entry.level)) return { ok: false };
      return persistDiagnosticEvent(entry);
    }
    if (message.type === 'CHAT_HISTORY_UPSERT' && 'message' in message) {
      const item = message.message as ConversationMessage;
      if (!item || typeof item.id !== 'string' || typeof item.origin !== 'string' || typeof item.content !== 'string' || !['user', 'assistant', 'system', 'unknown'].includes(item.role) || !['streaming', 'complete', 'incomplete'].includes(item.status)) return { ok: false };
      return backgroundUpsertConversationMessage(item)
        .then(() => ({ ok: true }))
        .catch(error => {
          console.error('[Chat Automation] Écriture de l’historique échouée dans le background.', error);
          return { ok: false };
        });
    }
    if (message.type === 'CHAT_HISTORY_MARK_INTERRUPTED' && 'origin' in message && typeof message.origin === 'string') {
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
