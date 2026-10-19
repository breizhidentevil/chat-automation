import { deduplicateConversationMessages, historyStorageKey, type ConversationMessage } from '../lib/history';
import { isValidConversationMessage } from '../lib/history-validation';
import type { StorageReader } from './variables-storage';

/** Load, validate, deduplicate, scope, and order messages for the History page. */
export async function loadVisibleHistory(
  read: StorageReader,
  origin: string,
  conversationId: string,
  limit = 300,
): Promise<ConversationMessage[]> {
  const key = historyStorageKey(origin);
  const stored = await read(key);
  const items = Array.isArray(stored[key]) ? stored[key].filter(isValidConversationMessage) as ConversationMessage[] : [];
  const siteItems = deduplicateConversationMessages(items.filter(item => item.origin === origin));
  const exactConversation = siteItems.filter(item => item.conversationId === conversationId);
  // SPA routes can change after capture; fall back to recent messages for the site.
  const visibleItems = exactConversation.length > 0 ? exactConversation : siteItems;
  return visibleItems.slice().sort((a, b) => a.firstSeenAt - b.firstSeenAt).slice(-limit).reverse();
}
