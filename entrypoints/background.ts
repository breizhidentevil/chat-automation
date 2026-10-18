import {
  backgroundMarkInterruptedMessagesIncomplete,
  backgroundUpsertConversationMessage,
  type ConversationMessage,
} from '../lib/history';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return undefined;
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
