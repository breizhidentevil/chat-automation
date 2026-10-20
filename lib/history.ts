import { isValidConversationMessage } from './history-validation';

export type ConversationRole = 'user' | 'assistant' | 'system' | 'unknown';
export type ConversationMessageStatus = 'streaming' | 'complete' | 'incomplete';

export interface ConversationMessage {
  id: string;
  conversationId: string;
  origin: string;
  role: ConversationRole;
  content: string;
  contentTruncated: boolean;
  status: ConversationMessageStatus;
  firstSeenAt: number;
  lastUpdatedAt: number;
  completedAt?: number;
  source: 'dom';
}

export const HISTORY_STORAGE_KEY = 'chatAutomationHistoryV1';
const HISTORY_CLEAR_MARKERS_KEY = 'chatAutomationHistoryClearedAtV1';
const MAX_HISTORY_CLEAR_MARKERS = 500;
const MAX_MESSAGE_CONTENT_LENGTH = 100_000;

/** Bound individual DOM records before messaging or persistence. */
function boundConversationMessage(message: ConversationMessage): ConversationMessage {
  if (message.content.length <= MAX_MESSAGE_CONTENT_LENGTH) return message;
  return {
    ...message,
    content: message.content.slice(0, MAX_MESSAGE_CONTENT_LENGTH),
    contentTruncated: true,
  };
}

function readHistoryClearMarkers(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_HISTORY_CLEAR_MARKERS));
}

/** Collapse duplicate DOM representations of the same visible message.
 * Distinct messages with identical text remain separate when they were first seen
 * more than one second apart. Duplicate nodes from one scan share nearly the same
 * firstSeenAt timestamp.
 */
export function deduplicateConversationMessages(messages: ConversationMessage[]): ConversationMessage[] {
  const sorted = [...messages].sort((a, b) => a.firstSeenAt - b.firstSeenAt);
  const result: ConversationMessage[] = [];
  for (const message of sorted) {
    // Updates to the same logical message must merge even when their content changes.
    const identityIndex = result.findIndex(existing =>
      existing.origin === message.origin && existing.id === message.id,
    );
    if (identityIndex >= 0) {
      result[identityIndex] = mergeConversationMessage(result[identityIndex]!, message);
      continue;
    }

    // Some sites expose the same visible message through multiple DOM nodes with
    // different generated IDs. Collapse only matching content observed within 1s.
    const duplicateIndex = result.findIndex(existing =>
      existing.origin === message.origin
      && existing.conversationId === message.conversationId
      && existing.role === message.role
      && existing.content === message.content
      && Math.abs(existing.firstSeenAt - message.firstSeenAt) <= 1000,
    );
    if (duplicateIndex < 0) {
      result.push(message);
      continue;
    }
    const previous = result[duplicateIndex]!;
    const latest = message.lastUpdatedAt >= previous.lastUpdatedAt ? message : previous;
    result[duplicateIndex] = {
      ...previous,
      ...latest,
      id: previous.id,
      firstSeenAt: Math.min(previous.firstSeenAt, message.firstSeenAt),
      lastUpdatedAt: Math.max(previous.lastUpdatedAt, message.lastUpdatedAt),
      status: statusRank(previous.status) >= statusRank(message.status) ? previous.status : message.status,
      ...(previous.completedAt !== undefined || message.completedAt !== undefined
        ? { completedAt: Math.max(previous.completedAt ?? 0, message.completedAt ?? 0) }
        : {}),
    };
  }
  return result.sort((a, b) => a.firstSeenAt - b.firstSeenAt);
}

const statusRank = (status: ConversationMessageStatus): number =>
  status === 'complete' ? 2 : status === 'incomplete' ? 1 : 0;

/** Merge updates without allowing a late streaming event to downgrade a final status. */
export function mergeConversationMessage(previous: ConversationMessage, incoming: ConversationMessage): ConversationMessage {
  const status = statusRank(previous.status) >= statusRank(incoming.status) ? previous.status : incoming.status;
  // Once a message is complete, a later-arriving streaming/incomplete snapshot
  // must not replace its final content just because its timestamp is newer.
  // Only another complete snapshot may update a completed message's payload.
  const preserveCompletedPayload = previous.status === 'complete' && incoming.status !== 'complete';
  const latest = preserveCompletedPayload
    ? previous
    : incoming.lastUpdatedAt >= previous.lastUpdatedAt ? incoming : previous;
  const completedAt = status === 'complete'
    ? Math.max(previous.completedAt ?? 0, incoming.completedAt ?? 0) || latest.lastUpdatedAt
    : undefined;
  return {
    ...previous,
    ...latest,
    id: previous.id,
    firstSeenAt: Math.min(previous.firstSeenAt, incoming.firstSeenAt),
    lastUpdatedAt: Math.max(previous.lastUpdatedAt, incoming.lastUpdatedAt),
    status,
    ...(completedAt !== undefined ? { completedAt } : {}),
  };
}

/** Keep the newest entries under both count and approximate text-storage budgets. */
export function limitConversationHistory(
  messages: ConversationMessage[],
  maxMessages = 2000,
  maxTextBudget = 1_500_000,
): ConversationMessage[] {
  const newestFirst: ConversationMessage[] = [];
  let budget = 0;
  for (let i = messages.length - 1; i >= 0 && newestFirst.length < maxMessages; i--) {
    const item = messages[i]!;
    const cost = item.content.length + 400;
    if (newestFirst.length > 0 && budget + cost > maxTextBudget) break;
    newestFirst.push(item);
    budget += cost;
  }
  return newestFirst.reverse();
}

export function historyStorageKey(_origin: string): string {
  return HISTORY_STORAGE_KEY;
}

export async function readConversationHistory(origin: string): Promise<ConversationMessage[]> {
  const result = await browser.storage.local.get(HISTORY_STORAGE_KEY);
  const value = result[HISTORY_STORAGE_KEY];
  return Array.isArray(value)
    ? value.filter(isValidConversationMessage).filter(message => message.origin === origin)
    : [];
}

/**
 * Mutations are routed through the background context so writes from multiple tabs
 * are serialized instead of racing to overwrite a shared storage snapshot.
 */
export async function upsertConversationMessage(message: ConversationMessage): Promise<void> {
  const boundedMessage = boundConversationMessage(message);
  try {
    const response = await browser.runtime.sendMessage({ type: 'CHAT_HISTORY_UPSERT', message: boundedMessage });
    if (response?.ok !== true) {
      console.warn('[Chat Automation] Le contexte background a refusé ou n’a pas confirmé l’écriture de l’historique.');
    }
  } catch (error) {
    // Never write directly from a content script: doing so would bypass the
    // background sender-origin checks and the serialized storage write queue.
    console.error('[Chat Automation] Transmission au contexte background impossible ; historique non persisté.', error);
  }
}

export async function markInterruptedMessagesIncomplete(origin: string): Promise<void> {
  try {
    const response = await browser.runtime.sendMessage({ type: 'CHAT_HISTORY_MARK_INTERRUPTED', origin });
    if (response?.ok !== true) {
      console.warn('[Chat Automation] Le contexte background a refusé ou n’a pas confirmé la réconciliation de l’historique.');
    }
  } catch (error) {
    // Keep all mutations behind the background origin check and write queue.
    console.error('[Chat Automation] Réconciliation background impossible ; historique inchangé.', error);
  }
}

let backgroundWriteQueue: Promise<void> = Promise.resolve();

export function backgroundUpsertConversationMessage(message: ConversationMessage): Promise<void> {
  const boundedMessage = boundConversationMessage(message);
  const operation = backgroundWriteQueue.then(async () => {
    const stored = await browser.storage.local.get([HISTORY_STORAGE_KEY, HISTORY_CLEAR_MARKERS_KEY]);
    const clearMarkers = readHistoryClearMarkers(stored[HISTORY_CLEAR_MARKERS_KEY]);
    // Reject writes captured before the latest clear, including writes from tabs
    // that missed the best-effort notification.
    if (boundedMessage.firstSeenAt <= (clearMarkers[boundedMessage.origin] ?? -1)) return;
    const current = deduplicateConversationMessages(
      Array.isArray(stored[HISTORY_STORAGE_KEY])
        ? stored[HISTORY_STORAGE_KEY].filter(isValidConversationMessage)
        : [],
    );
    const index = current.findIndex(item => item.id === boundedMessage.id && item.origin === boundedMessage.origin);
    if (index >= 0) {
      const old = current[index]!;
      current[index] = mergeConversationMessage(old, boundedMessage);
    } else {
      current.push({ ...boundedMessage, ...(boundedMessage.status === 'complete' ? { completedAt: boundedMessage.completedAt ?? Date.now() } : {}) });
    }

    // Bound the shared history by both entry count and approximate text size.
    await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: limitConversationHistory(deduplicateConversationMessages(current)) });
  });
  backgroundWriteQueue = operation.catch(error => {
    console.error('[Chat Automation] Échec de persistance de l’historique', error);
  });
  return operation;
}

export function backgroundMarkInterruptedMessagesIncomplete(origin: string): Promise<void> {
  const operation = backgroundWriteQueue.then(async () => {
    const stored = await browser.storage.local.get(HISTORY_STORAGE_KEY);
    const current = deduplicateConversationMessages(
      Array.isArray(stored[HISTORY_STORAGE_KEY])
        ? stored[HISTORY_STORAGE_KEY].filter(isValidConversationMessage)
        : [],
    );
    let changed = false;
    const updated = current.map(message => {
      if (message.origin !== origin || message.status !== 'streaming') return message;
      changed = true;
      return { ...message, status: 'incomplete' as const, lastUpdatedAt: Date.now() };
    });
    if (changed) await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: limitConversationHistory(updated) });
  });
  backgroundWriteQueue = operation.catch(error => {
    console.error('[Chat Automation] Échec de réconciliation de l’historique', error);
  });
  return operation;
}

/** Delete one site's retained messages through the same queue as history writes. */
export function backgroundClearSiteHistory(origin: string): Promise<void> {
  const operation = backgroundWriteQueue.then(async () => {
    const stored = await browser.storage.local.get([HISTORY_STORAGE_KEY, HISTORY_CLEAR_MARKERS_KEY]);
    const current = Array.isArray(stored[HISTORY_STORAGE_KEY])
      ? stored[HISTORY_STORAGE_KEY].filter(isValidConversationMessage)
      : [];
    const markers = readHistoryClearMarkers(stored[HISTORY_CLEAR_MARKERS_KEY]);
    markers[origin] = Date.now();
    const boundedMarkers = Object.fromEntries(Object.entries(markers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_HISTORY_CLEAR_MARKERS));
    await browser.storage.local.set({
      [HISTORY_STORAGE_KEY]: current.filter(message => message.origin !== origin),
      [HISTORY_CLEAR_MARKERS_KEY]: boundedMarkers,
    });
  });
  backgroundWriteQueue = operation.catch(error => {
    console.error('[Chat Automation] Échec de suppression de l’historique', error);
  });
  return operation;
}
