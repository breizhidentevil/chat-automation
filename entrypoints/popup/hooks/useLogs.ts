import { useRef, useState } from 'react';
import type { DiagnosticEvent } from '../../../lib/contracts';
import { isValidDiagnosticEvent } from '../../../lib/diagnostic-validation';
import { loadRecentLogs } from '../../../services/logs-service';
import { downloadJsonFile } from '../../../services/file-export';
import { usePagePolling } from './usePagePolling';
import { translate } from '../../../lib/i18n';

type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;

interface UseLogsOptions {
  enabled: boolean;
  t: Translate;
  setStatus: (value: string) => void;
}

export function useLogs({ enabled, t, setStatus }: UseLogsOptions) {
  const [logs, setLogs] = useState<DiagnosticEvent[]>([]);
  const readErrorReported = useRef(false);

  async function refreshLogs() {
    try {
      const entries = await loadRecentLogs(key => browser.storage.local.get(key));
      setLogs(entries);
      readErrorReported.current = false;
    } catch (error) {
      if (!readErrorReported.current) {
        console.error('[Chat Automation] Lecture des journaux échouée.', error);
        setStatus(t('logsReadError'));
        readErrorReported.current = true;
      }
    }
  }

  usePagePolling(enabled, refreshLogs, 1000);

  async function clearLogs() {
    if (!window.confirm(t('confirmClearLogs'))) return;
    try {
      const response = await browser.runtime.sendMessage({ type: 'CHAT_LOGS_CLEAR' });
      if (response?.ok !== true) throw new Error('Background refused log deletion');
      setLogs([]);
      setStatus(t('logsCleared'));
    } catch (error) {
      console.error('[Chat Automation] Effacement des journaux échoué.', error);
      setStatus(t('logsClearError'));
    }
  }

  async function exportLogs() {
    try {
      const data = await browser.storage.local.get('chatAutomationLogs');
      const entries = Array.isArray(data.chatAutomationLogs) ? data.chatAutomationLogs.filter(isValidDiagnosticEvent) : [];
      downloadJsonFile(entries, 'chat-automation-logs.json');
      setStatus(t('logsExportStarted'));
    } catch (error) {
      console.error('[Chat Automation] Export des journaux échoué.', error);
      setStatus(t('logsExportError'));
    }
  }

  return { logs, refreshLogs, clearLogs, exportLogs };
}
