import type { DiagnosticEvent } from '../lib/contracts';
import {
  backgroundMarkInterruptedMessagesIncomplete,
  backgroundUpsertConversationMessage,
} from '../lib/history';
import { isValidConversationMessage } from '../lib/history-validation';
import { isValidDiagnosticEvent } from '../lib/diagnostic-validation';

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
      if (!isValidDiagnosticEvent(message.entry)) return { ok: false };
      return persistDiagnosticEvent(message.entry)
        .then(result => result)
        .catch(() => ({ ok: false }));
    }
    if (message.type === 'CHAT_HISTORY_UPSERT' && 'message' in message) {
      if (!isValidConversationMessage(message.message)) return { ok: false };
      return backgroundUpsertConversationMessage(message.message)
        .then(() => ({ ok: true }))
        .catch(error => {
          console.error('[Chat Automation] Écriture de l’historique échouée dans le background.', error);
          return { ok: false };
        });
    }
    if (message.type === 'CHAT_HISTORY_MARK_INTERRUPTED' && 'origin' in message && typeof message.origin === 'string') {
      try {
        const origin = new URL(message.origin);
        if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== message.origin) return { ok: false };
      } catch {
        return { ok: false };
      }
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
