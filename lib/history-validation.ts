import type { ConversationMessage } from './history';

const MAX_ID_LENGTH = 512;
const MAX_ORIGIN_LENGTH = 2048;
const MAX_CONVERSATION_ID_LENGTH = 2048;
const MAX_MESSAGE_CONTENT_LENGTH = 500_000;

export function isValidConversationMessage(value: unknown): value is ConversationMessage {
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
