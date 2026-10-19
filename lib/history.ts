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

/** Collapse duplicate DOM representations of the same visible message.
 * Distinct messages with identical text remain separate when they were first seen
 * more than one second apart. Duplicate nodes from one scan share nearly the same
 * firstSeenAt timestamp.
 */
export function deduplicateConversationMessages(messages: ConversationMessage[]): ConversationMessage[] {
  const sorted = [...messages].sort((a, b) => a.firstSeenAt - b.firstSeenAt);
  const result: ConversationMessage[] = [];
  for (const message of sorted) {
    const duplicateIndex = result.findIndex(existing =>
      existing.origin === message.origin
      && existing.conversationId === message.conversationId
      && existing.role === message.role
      && existing.content === message.content
      && Math.abs(existing.firstSeenAt - message.firstSeenAt) <= 1000
    );
    if (duplicateIndex < 0) {
      result.push(message);
      continue;
    }
    const previous = result[duplicateIndex]!;
    const statusRank = (status: ConversationMessageStatus) => status === 'complete' ? 2 : status === 'incomplete' ? 1 : 0;
    const latest = message.lastUpdatedAt >= previous.lastUpdatedAt ? message : previous;
    result[duplicateIndex] = {
      ...previous,
      ...latest,
      id: previous.id,
      firstSeenAt: Math.min(previous.firstSeenAt, message.firstSeenAt),
      lastUpdatedAt: Math.max(previous.lastUpdatedAt, message.lastUpdatedAt),
      status: statusRank(previous.status) >= statusRank(message.status) ? previous.status : message.status,
      ...(previous.completedAt || message.completedAt ? { completedAt: Math.max(previous.completedAt ?? 0, message.completedAt ?? 0) } : {}),
    };
  }
  return result;
}

export function historyStorageKey(_origin: string): string {
  return HISTORY_STORAGE_KEY;
}

export async function readConversationHistory(origin: string): Promise<ConversationMessage[]> {
  const result = await browser.storage.local.get(HISTORY_STORAGE_KEY);
  const value = result[HISTORY_STORAGE_KEY];
  return Array.isArray(value) ? (value as ConversationMessage[]).filter(message => message.origin === origin) : [];
}

/**
 * Mutations are routed through the background context so writes from multiple tabs
 * are serialized instead of racing to overwrite a shared storage snapshot.
 */
export async function upsertConversationMessage(message: ConversationMessage): Promise<void> {
  try {
    const response = await browser.runtime.sendMessage({ type: 'CHAT_HISTORY_UPSERT', message });
    if (response?.ok === true) return;
    console.warn('[Chat Automation] Le contexte background n’a pas confirmé l’écriture de l’historique ; tentative de sauvegarde directe.');
  } catch (error) {
    console.warn('[Chat Automation] Transmission au contexte background impossible ; tentative de sauvegarde directe.', error);
  }

  // Fallback important : si le background n’est pas prêt ou si son listener n’est
  // pas disponible, le content script persiste quand même le message capturé.
  try {
    const stored = await browser.storage.local.get(HISTORY_STORAGE_KEY);
    const current = deduplicateConversationMessages(Array.isArray(stored[HISTORY_STORAGE_KEY]) ? stored[HISTORY_STORAGE_KEY] as ConversationMessage[] : []);
    const index = current.findIndex(item => item.id === message.id && item.origin === message.origin);
    if (index >= 0) {
      const previous = current[index]!;
      current[index] = { ...previous, ...message, firstSeenAt: previous.firstSeenAt };
    } else {
      current.push(message);
    }
    await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: deduplicateConversationMessages(current).slice(-2000) });
  } catch (error) {
    console.error('[Chat Automation] Échec de la sauvegarde directe de l’historique.', error);
  }
}

export async function markInterruptedMessagesIncomplete(origin: string): Promise<void> {
  try {
    const response = await browser.runtime.sendMessage({ type: 'CHAT_HISTORY_MARK_INTERRUPTED', origin });
    if (response?.ok === true) return;
  } catch (error) {
    console.warn('[Chat Automation] Réconciliation background indisponible ; tentative directe.', error);
  }
  try {
    const stored = await browser.storage.local.get(HISTORY_STORAGE_KEY);
    const current = deduplicateConversationMessages(Array.isArray(stored[HISTORY_STORAGE_KEY]) ? stored[HISTORY_STORAGE_KEY] as ConversationMessage[] : []);
    const updated = current.map(message => message.origin === origin && message.status === 'streaming'
      ? { ...message, status: 'incomplete' as const, lastUpdatedAt: Date.now() }
      : message);
    await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: updated });
  } catch (error) {
    console.error('[Chat Automation] Échec de la réconciliation directe de l’historique.', error);
  }
}

let backgroundWriteQueue: Promise<void> = Promise.resolve();

export function backgroundUpsertConversationMessage(message: ConversationMessage): Promise<void> {
  const operation = backgroundWriteQueue.then(async () => {
    const stored = await browser.storage.local.get(HISTORY_STORAGE_KEY);
    const current = deduplicateConversationMessages(Array.isArray(stored[HISTORY_STORAGE_KEY]) ? stored[HISTORY_STORAGE_KEY] as ConversationMessage[] : []);
    const index = current.findIndex(item => item.id === message.id && item.origin === message.origin);
    if (index >= 0) {
      const old = current[index]!;
      const merged: ConversationMessage = { ...old, ...message, firstSeenAt: old.firstSeenAt };
      if (message.status === 'complete') merged.completedAt = message.completedAt ?? old.completedAt ?? Date.now();
      else delete merged.completedAt;
      current[index] = merged;
    } else {
      current.push({ ...message, ...(message.status === 'complete' ? { completedAt: message.completedAt ?? Date.now() } : {}) });
    }

    // One global text budget keeps the extension's shared storage below common quotas.
    const newestFirst: ConversationMessage[] = [];
    let budget = 0;
    for (let i = current.length - 1; i >= 0 && newestFirst.length < 2000; i--) {
      const item = current[i]!;
      // Bound individual records as well as the aggregate budget. Without this,
      // one unusually large DOM message could exceed the entire storage budget.
      const boundedItem = item.content.length > 100_000
        ? { ...item, content: item.content.slice(0, 100_000), contentTruncated: true }
        : item;
      const cost = boundedItem.content.length + 400;
      if (budget + cost > 1_500_000) break;
      newestFirst.push(boundedItem);
      budget += cost;
    }
    await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: deduplicateConversationMessages(newestFirst.reverse()) });
  });
  backgroundWriteQueue = operation.catch(error => {
    console.error('[Chat Automation] Échec de persistance de l’historique', error);
  });
  return operation;
}

export function backgroundMarkInterruptedMessagesIncomplete(origin: string): Promise<void> {
  const operation = backgroundWriteQueue.then(async () => {
    const stored = await browser.storage.local.get(HISTORY_STORAGE_KEY);
    const current = deduplicateConversationMessages(Array.isArray(stored[HISTORY_STORAGE_KEY]) ? stored[HISTORY_STORAGE_KEY] as ConversationMessage[] : []);
    let changed = false;
    const updated = current.map(message => {
      if (message.origin !== origin || message.status !== 'streaming') return message;
      changed = true;
      return { ...message, status: 'incomplete' as const, lastUpdatedAt: Date.now() };
    });
    if (changed) await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: updated });
  });
  backgroundWriteQueue = operation.catch(error => {
    console.error('[Chat Automation] Échec de réconciliation de l’historique', error);
  });
  return operation;
}
