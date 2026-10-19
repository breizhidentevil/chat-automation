import type { DiagnosticEvent } from '../lib/contracts';
import {
  backgroundMarkInterruptedMessagesIncomplete,
  backgroundUpsertConversationMessage,
  type ConversationMessage,
} from '../lib/history';

const LOG_KEY = 'chatAutomationLogs';
const MAX_LOGS = 500;
const MAX_ID_LENGTH = 512;
const MAX_ORIGIN_LENGTH = 2048;
const MAX_CONVERSATION_ID_LENGTH = 2048;
const MAX_MESSAGE_CONTENT_LENGTH = 500_000;
let logWriteQueue: Promise<void> = Promise.resolve();

function isValidConversationMessage(value: unknown): value is ConversationMessage {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ConversationMessage>;
  if (typeof item.id !== 'string' || item.id.length === 0 || item.id.length > MAX_ID_LENGTH) return false;
  if (typeof item.conversationId !== 'string' || item.conversationId.length === 0 || item.conversationId.length > MAX_CONVERSATION_ID_LENGTH) return false;
  if (typeof item.origin !== 'string' || item.origin.length > MAX_ORIGIN_LENGTH) return false;
  try {
    const origin = new URL(item.origin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== item.origin) return false;
  } catch {
    return false;
  }
  if (typeof item.content !== 'string' || item.content.length > MAX_MESSAGE_CONTENT_LENGTH) return false;
  if (typeof item.contentTruncated !== 'boolean') return false;
  if (!['user', 'assistant', 'system', 'unknown'].includes(item.role as string)) return false;
  if (!['streaming', 'complete', 'incomplete'].includes(item.status as string)) return false;
  if (!Number.isFinite(item.firstSeenAt) || !Number.isFinite(item.lastUpdatedAt)) return false;
  if ((item.firstSeenAt as number) < 0 || (item.lastUpdatedAt as number) < (item.firstSeenAt as number)) return false;
  if (item.completedAt !== undefined && (!Number.isFinite(item.completedAt) || item.completedAt < 0)) return false;
  if (item.status === 'complete' && item.completedAt !== undefined && item.completedAt < item.firstSeenAt!) return false;
  return item.source === 'dom';
}

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
