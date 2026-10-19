import { useState } from 'react';
import { deduplicateConversationMessages, historyStorageKey, type ConversationMessage } from '../../../lib/history';
import { isValidConversationMessage } from '../../../lib/history-validation';
import { selectHistoryExportMessages } from '../../../lib/history-export';
import { loadVisibleHistory } from '../../../services/history-service';
import { downloadJsonFile } from '../../../services/file-export';
import { usePagePolling } from './usePagePolling';
import { translate } from '../../../lib/i18n';

type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;

interface UseHistoryOptions {
  enabled: boolean;
  t: Translate;
  activeTab: () => Promise<Browser.tabs.Tab>;
  setStatus: (value: string) => void;
}

export function useHistory({ enabled, t, activeTab, setStatus }: UseHistoryOptions) {
  const [historyMessages, setHistoryMessages] = useState<ConversationMessage[]>([]);
  const [historyOrigin, setHistoryOrigin] = useState('');
  const [historyConversationId, setHistoryConversationId] = useState('');
  const [historyError, setHistoryError] = useState('');

  async function refreshHistory() {
    setHistoryError('');
    try {
      const tab = await activeTab();
      const currentUrl = new URL(tab.url!);
      const origin = currentUrl.origin;
      const conversationId = `${origin}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      setHistoryOrigin(origin);
      setHistoryConversationId(conversationId);
      const visibleItems = await loadVisibleHistory(key => browser.storage.local.get(key), origin, conversationId);
      setHistoryMessages(visibleItems);
    } catch (error) {
      setHistoryMessages([]);
      setHistoryOrigin('');
      setHistoryConversationId('');
      setHistoryError(error instanceof Error ? error.message : t('historyLoadError'));
    }
  }

  usePagePolling(enabled, refreshHistory, 1500);

  async function clearSiteHistory() {
    if (!historyOrigin) return;
    const confirmed = window.confirm(t('confirmClearHistory', { origin: historyOrigin }));
    if (!confirmed) return;
    try {
      const response = await browser.runtime.sendMessage({ type: 'CHAT_HISTORY_CLEAR_SITE', origin: historyOrigin });
      if (response?.ok !== true) throw new Error('Background refused history deletion');
      setHistoryMessages([]);
      setStatus(t('historyCleared'));
    } catch (error) {
      console.error('[Chat Automation] Effacement de l’historique échoué.', error);
      setHistoryError(t('historyClearError'));
    }
  }

  async function exportHistory() {
    try {
      const key = historyStorageKey(historyOrigin);
      const data = await browser.storage.local.get(key);
      const allItems = Array.isArray(data[key]) ? data[key].filter(isValidConversationMessage) as ConversationMessage[] : [];
      const selectedItems = selectHistoryExportMessages(
        deduplicateConversationMessages(allItems),
        historyOrigin,
        historyConversationId,
      );
      const payload = { origin: historyOrigin, conversationId: historyConversationId, exportedAt: new Date().toISOString(), messages: selectedItems };
      downloadJsonFile(payload, `chat-history-${historyOrigin.replace(/[^a-z0-9.-]+/gi, '-') || 'site'}.json`);
      setStatus(t('historyExportStarted'));
    } catch (error) {
      console.error('[Chat Automation] Export de l’historique échoué.', error);
      setStatus(t('historyExportError'));
    }
  }

  return {
    historyMessages, historyOrigin, historyConversationId, historyError,
    refreshHistory, clearSiteHistory, exportHistory,
  };
}
