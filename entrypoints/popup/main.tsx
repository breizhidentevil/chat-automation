import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { deduplicateConversationMessages, historyStorageKey, type ConversationMessage } from '../../lib/history';
import { isValidConversationMessage } from '../../lib/history-validation';
import { isValidDiagnosticEvent } from '../../lib/diagnostic-validation';
import { isValidChatSiteProcedure } from '../../lib/procedure-validation';
import { isValidVariableName, MAX_VARIABLE_VALUE_LENGTH, MAX_VARIABLE_DEFINITIONS, MAX_TOTAL_VARIABLE_VALUE_LENGTH, type VariableDefinition, type VariableScope } from '../../lib/variables';
import { LOCALE_STORAGE_KEY, preferredLocale, translate, type Locale } from '../../lib/i18n';
import { contentScriptIdForOrigin } from '../../lib/content-script-id';
import { selectHistoryExportMessages } from '../../lib/history-export';
import { simulateAutomation, type SimulationResult } from '../../lib/simulator';
import { addMessage, moveMessage, removeMessage, updateMessage } from '../../lib/message-sequence';
import { buildAutomationStartPayload, validateAutomationConfig } from '../../lib/automation-config';
import { previewMessageTemplate, type TemplatePreviewResult } from '../../lib/template-preview';
import { loadStoredVariables, saveStoredVariables } from '../../services/variables-storage';
import { loadAutomationSettings, saveAutomationSettings } from '../../services/automation-settings';
import { loadVisibleHistory } from '../../services/history-service';
import { loadRecentLogs } from '../../services/logs-service';
import TemplateTextarea from './components/TemplateTextarea';
import SimulatorPage from './pages/SimulatorPage';
import HistoryPage from './pages/HistoryPage';
import LogsPage from './pages/LogsPage';
import VariablesPage from './pages/VariablesPage';
import { downloadJsonFile } from '../../services/file-export';

type LogEntry = import('../../lib/contracts').DiagnosticEvent;
type Page = 'automation' | 'variables' | 'history' | 'logs' | 'simulator';
type RuntimeStatus = { phase: 'stopped' | 'ready' | 'waiting-interval' | 'waiting-window' | 'waiting-llm' | 'sending' | 'finished' | 'failed'; note: string; messageIndex: number; messagesCount: number; completedSequences: number; repeatMode: 'infinite' | 'finite'; repeatCount: number; nextSendAt: number | null; updatedAt: number };


function toLocalDateTimeInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function Popup() {
  const [locale, setLocale] = useState<Locale>(preferredLocale(typeof navigator !== 'undefined' ? navigator.language : 'fr'));
  const t = (key: Parameters<typeof translate>[1], values: Record<string, string | number> = {}) => Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), translate(locale, key));
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);


  const [page, setPage] = useState<Page>('automation');
  const logReadErrorReported = useRef(false);
  const runtimeReadErrorReported = useRef(false);
  const [strategyReady, setStrategyReady] = useState<boolean | null>(null);
  const [strategyOrigin, setStrategyOrigin] = useState('');
  const [message, setMessage] = useState('');
  const [automationMessages, setAutomationMessages] = useState<string[]>(['']);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [status, setStatus] = useState(preferredLocale(typeof navigator !== 'undefined' ? navigator.language : 'fr') === 'fr' ? 'Prêt. Ouvrez une page contenant un chat.' : 'Ready. Open a page containing a chat.');
  const [siteAccessStatus, setSiteAccessStatus] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [historyMessages, setHistoryMessages] = useState<ConversationMessage[]>([]);
  const [variables, setVariables] = useState<VariableDefinition[]>([]);
  const [variableName, setVariableName] = useState('');
  const [variableValue, setVariableValue] = useState('');
  const [variableScope, setVariableScope] = useState<VariableScope>('global');
  const [editingVariableId, setEditingVariableId] = useState<string | null>(null);
  const [variableError, setVariableError] = useState('');
  const [variablePreviewText, setVariablePreviewText] = useState('Bonjour {{prenom}}');
  const [variablePreviewResult, setVariablePreviewResult] = useState<TemplatePreviewResult | null>(null);
  const [variablePreviewError, setVariablePreviewError] = useState('');
  const [historyOrigin, setHistoryOrigin] = useState('');
  const [historyConversationId, setHistoryConversationId] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [interval, setIntervalValue] = useState('30');
  const [unit, setUnit] = useState<'seconds' | 'minutes'>('seconds');
  // 0 signifie une répétition infinie ; toute valeur positive définit le nombre d’envois.
  const [repeatCount, setRepeatCount] = useState('0');
  const [timeWindowEnabled, setTimeWindowEnabled] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [simulationContext, setSimulationContext] = useState(`{
  "chat": { "session": { "title": "Conversation de test", "url": "https://example.test/chat" } },
  "data": { "ticket": "A-123", "items": [{ "name": "Exemple", "value": "123" }] }
}`);
  const [simulationStartAt, setSimulationStartAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [simulationCycles, setSimulationCycles] = useState('2');
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulationError, setSimulationError] = useState('');

  useEffect(() => {
    let active = true;
    setVariablePreviewError('');
    void previewMessageTemplate(variablePreviewText, variables, 'automation')
      .then(result => {
        if (active) setVariablePreviewResult(result);
      })
      .catch(error => {
        if (!active) return;
        setVariablePreviewResult(null);
        setVariablePreviewError(error instanceof Error ? error.message : 'Preview unavailable');
      });
    return () => { active = false; };
  }, [variablePreviewText, variables]);

  async function refreshStrategyStatus() {
    try {
      const tab = await activeTab();
      const origin = new URL(tab.url!).origin;
      setStrategyOrigin(origin);
      const data = await browser.storage.local.get('chatAutomationProcedures');
      const procedures = data.chatAutomationProcedures;
      setStrategyReady(
        Boolean(procedures && typeof procedures === 'object' &&
          isValidChatSiteProcedure((procedures as Record<string, unknown>)[origin], origin)),
      );
    } catch {
      setStrategyOrigin('');
      setStrategyReady(false);
      setStatus(t('openChatTab'));
    }
  }

  async function refreshLogs() {
    try {
      const entries = await loadRecentLogs(key => browser.storage.local.get(key));
      setLogs(entries as LogEntry[]);
      logReadErrorReported.current = false;
    } catch (error) {
      if (!logReadErrorReported.current) {
        console.error('[Chat Automation] Lecture des journaux échouée.', error);
        setStatus(t('logsReadError'));
        logReadErrorReported.current = true;
      }
    }
  }

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
      // Keep export scope explicit even when the selected conversation has no stored messages.
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

  useEffect(() => {
    void browser.storage.local.get(LOCALE_STORAGE_KEY).then(data => {
      const saved = data[LOCALE_STORAGE_KEY];
      if (saved === 'fr' || saved === 'en') setLocale(saved);
    }).catch(error => {
      console.error('[Chat Automation] Lecture de la langue échouée.', error);
    });
    void refreshLogs();
    void loadStoredVariables(key => browser.storage.local.get(key)).then(saved => {
      setVariables(saved);
    }).catch(error => {
      console.error('[Chat Automation] Lecture des variables échouée.', error);
      setVariableError(t('variablesReadError'));
    });
    void loadAutomationSettings(key => browser.storage.local.get(key)).then(saved => {
      if (!saved) return;
      setMessage(saved.message);
      setAutomationMessages(saved.messages);
      setIntervalValue(saved.interval); setUnit(saved.unit);
      setRepeatCount(saved.repeatCount);
      setTimeWindowEnabled(saved.timeWindowEnabled);
      setStartTime(saved.startTime); setEndTime(saved.endTime);
    }).catch(() => {
      setStatus(t('settingsReadError'));
    });
  }, []);

  useEffect(() => {
    if (page === 'automation') void refreshStrategyStatus();
  }, [page]);

  useEffect(() => {
    if (page !== 'history') return;
    void refreshHistory();
    const timer = window.setInterval(() => { void refreshHistory(); }, 1500);
    return () => window.clearInterval(timer);
  }, [page]);

  useEffect(() => {
    if (page !== 'logs') return;
    void refreshLogs();
    const timer = window.setInterval(() => { void refreshLogs(); }, 1000);
    return () => window.clearInterval(timer);
  }, [page]);

  useEffect(() => {
    let mounted = true;
    const refreshRuntimeStatus = async () => {
      try {
        const data = await browser.storage.local.get('chatAutomationRuntimeStatus');
        runtimeReadErrorReported.current = false;
        if (mounted) setRuntimeStatus((data.chatAutomationRuntimeStatus as RuntimeStatus | undefined) ?? null);
      } catch (error) {
        if (!runtimeReadErrorReported.current) {
          console.error('[Chat Automation] Lecture de l’état d’exécution échouée.', error);
          if (mounted) setStatus(t('automationStatusReadError'));
          runtimeReadErrorReported.current = true;
        }
      }
    };
    void refreshRuntimeStatus();
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
      void refreshRuntimeStatus();
    }, 500);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  async function persistSettings(): Promise<boolean> {
    try {
      await saveAutomationSettings(items => browser.storage.local.set(items), { message, messages: automationMessages, interval, unit, repeatCount, timeWindowEnabled, startTime, endTime });
      return true;
    } catch (error) {
      console.error('[Chat Automation] Écriture des paramètres échouée.', error);
      setStatus(t('settingsSaveError'));
      return false;
    }
  }

  async function persistVariables(next: VariableDefinition[]): Promise<boolean> {
    try {
      const safeNext = await saveStoredVariables(items => browser.storage.local.set(items), next);
      setVariables(safeNext);
      setVariableError('');
      return true;
    } catch (error) {
      console.error('[Chat Automation] Écriture des variables échouée.', error);
      setVariableError(t('variablesSaveError'));
      return false;
    }
  }

  async function saveVariable() {
    setVariableError('');
    const name = variableName.trim();
    if (!isValidVariableName(name)) { setVariableError(t('invalidVariableName')); return; }
    if (!variableValue.trim()) { setVariableError(t('emptyVariableValue')); return; }
    if (variableValue.length > MAX_VARIABLE_VALUE_LENGTH) { setVariableError(t('variableValueTooLong')); return; }
    if (variables.some(item => item.name === name && item.scope === variableScope && item.id !== editingVariableId)) { setVariableError(t('duplicateVariable')); return; }
    const item: VariableDefinition = { id: editingVariableId ?? `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, type: 'static', value: variableValue, scope: variableScope, updatedAt: Date.now() };
    const next = editingVariableId ? variables.map(existing => existing.id === editingVariableId ? item : existing) : [...variables, item];
    const totalValueLength = next.reduce((total, variable) => total + variable.value.length, 0);
    if (next.length > MAX_VARIABLE_DEFINITIONS || totalValueLength > MAX_TOTAL_VARIABLE_VALUE_LENGTH) {
      setVariableError(locale === 'fr'
        ? 'Limite atteinte : 100 variables et 1 000 000 caractères cumulés au maximum.'
        : 'Limit reached: at most 100 variables and 1,000,000 combined characters.');
      return;
    }
    if (!await persistVariables(next)) return;
    setVariableName(''); setVariableValue(''); setVariableScope('global'); setEditingVariableId(null);
    setStatus(t('testSaved', { name }));
  }

  function editVariable(item: VariableDefinition) {
    setEditingVariableId(item.id); setVariableName(item.name); setVariableValue(item.value); setVariableScope(item.scope); setVariableError('');
  }

  async function deleteVariable(item: VariableDefinition) {
    if (!window.confirm(t('confirmDeleteVariable', { name: item.name }))) return;
    await persistVariables(variables.filter(existing => existing.id !== item.id));
    if (editingVariableId === item.id) { setEditingVariableId(null); setVariableName(''); setVariableValue(''); setVariableScope('global'); }
  }

  async function activeTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error(t('strategyUnavailable'));
    return tab;
  }

  async function ensureSiteAccess(tab: Browser.tabs.Tab): Promise<boolean> {
    if (!tab.id || !tab.url) return false;
    const origin = new URL(tab.url).origin;
    const pattern = origin + '/*';
    const granted = await browser.permissions.contains({ origins: [pattern] })
      || await browser.permissions.request({ origins: [pattern] });
    if (!granted) {
      setSiteAccessStatus(t('siteAccessDenied', { origin }));
      return false;
    }

    const id = contentScriptIdForOrigin(origin);
    // Remove registrations created by older versions before switching to hashed IDs.
    const legacyId = 'chat-automation-' + origin.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (legacyId !== id) {
      const legacy = await browser.scripting.getRegisteredContentScripts({ ids: [legacyId] });
      if (legacy.some(script => script.matches?.includes(pattern))) {
        await browser.scripting.unregisterContentScripts({ ids: [legacyId] });
      }
    }
    const registered = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
    if (registered.length === 0) {
      await browser.scripting.registerContentScripts([{
        id,
        matches: [pattern],
        js: ['/content-scripts/content.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      }]);
    }

    try {
      const response = await browser.tabs.sendMessage(tab.id, { type: 'CHAT_AUTOMATION_PING' });
      if (response?.ready === true) {
        setSiteAccessStatus(t('siteAccessEnabled', { origin }));
        return true;
      }
    } catch {
      // Existing tabs do not receive a newly registered script until navigation.
    }

    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/content.js'] });
    setSiteAccessStatus(t('siteAccessEnabledScriptLoaded', { origin }));
    return true;
  }

  async function enableActiveSite() {
    try {
      const tab = await activeTab();
      await ensureSiteAccess(tab);
    } catch (error) {
      setSiteAccessStatus(error instanceof Error ? error.message : (t('siteAccessError')));
    }
  }

  async function validateStrategy() {
    const text = message.trim();
    if (!text) { setStatus(t('testMessageRequired')); return; }
    const confirmed = window.confirm(t('testConfirm'));
    if (!confirmed) return;
    try {
      const tab = await activeTab();
      if (!await ensureSiteAccess(tab)) return;
      setStatus(t('testRunning'));
      const response = await browser.tabs.sendMessage(tab.id!, { type: 'CHAT_AUTOMATION_VALIDATE', text });
      setStatus(typeof response?.message === 'string' ? response.message : (t('testInconclusive')));
      await refreshStrategyStatus();
      await refreshLogs();
    } catch (error) {
      setStatus(error instanceof Error && error.message.startsWith('Cette page') ? error.message : t('pageScriptUnavailable'));
    }
  }

  function updateAutomationMessage(index: number, value: string) {
    setAutomationMessages(current => updateMessage(current, index, value));
  }

  function addAutomationMessage() {
    setAutomationMessages(current => addMessage(current));
  }

  function removeAutomationMessage(index: number) {
    setAutomationMessages(current => removeMessage(current, index));
  }

  function moveAutomationMessage(from: number, to: number) {
    setAutomationMessages(current => moveMessage(current, from, to));
  }

  async function runSimulation() {
    setSimulationError('');
    setSimulationResult(null);
    const messages = automationMessages.map(item => item.trim());
    if (!messages.length || messages.some(item => !item)) {
      setSimulationError(t('sequenceEmpty'));
      return;
    }
    let dynamicData: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(simulationContext);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(t('simulationContextInvalid'));
      dynamicData = parsed as Record<string, unknown>;
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : t('simulationContextInvalid'));
      return;
    }
    const cycleCount = Number(simulationCycles);
    const intervalAmount = Number(interval);
    const startAt = new Date(simulationStartAt);
    if (!Number.isSafeInteger(cycleCount) || cycleCount < 1 || cycleCount > 10) {
      setSimulationError(t('simulationCycleLimit'));
      return;
    }
    if (!Number.isFinite(intervalAmount) || intervalAmount <= 0 || !Number.isFinite(startAt.getTime())) {
      setSimulationError(t('simulationInvalidSettings'));
      return;
    }
    try {
      const result = await simulateAutomation({
        messages,
        variables,
        intervalMs: Math.round(intervalAmount * (unit === 'minutes' ? 60_000 : 1_000)),
        repeatCount: cycleCount,
        startAt,
        timeWindowEnabled,
        startTime,
        endTime,
        dynamicData,
      });
      setSimulationResult(result);
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : t('simulationFailedGeneric'));
    }
  }

  async function startAutomation() {
    const validation = validateAutomationConfig({
      messages: automationMessages,
      interval,
      unit,
      repeatCount,
      timeWindowEnabled,
      startTime,
      endTime,
      variables,
    });
    if (!validation.ok) {
      switch (validation.code) {
        case 'sequenceEmpty':
          setStatus(t('sequenceEmpty'));
          return;
        case 'sequenceTooLong':
          setStatus(t('sequenceTooLong'));
          return;
        case 'unknownVariables':
          setStatus(t('unknownVariables', {
            number: validation.messageIndex ?? 1,
            names: (validation.names ?? []).map(name => `{{${name}}}`).join(', '),
          }));
          setPage('variables');
          return;
        case 'invalidVariableSyntax':
          setStatus(t('invalidVariableSyntax', { number: validation.messageIndex ?? 1 }));
          return;
        case 'invalidInterval':
          setStatus(t('invalidInterval'));
          return;
        case 'invalidRepeatCount':
          setStatus(t('invalidRepeatCount'));
          return;
        case 'invalidTimeWindow':
          setStatus(t('invalidTimeWindow'));
          return;
        case 'invalidSettings':
          setStatus(t('invalidSettings'));
          return;
        default:
          return;
      }
    }

    try {
      const tab = await activeTab();
      if (!await ensureSiteAccess(tab)) return;
      const payload = buildAutomationStartPayload(validation.config);
      if (!await persistSettings()) return;
      const response = await browser.tabs.sendMessage(tab.id!, payload);
      setStatus(typeof response?.message === 'string' ? response.message : t('automationStarted'));
      await refreshLogs();
    } catch (error) {
      setStatus(error instanceof Error && error.message.startsWith(locale === 'fr' ? 'Cette page' : 'This page') ? error.message : (locale === 'fr' ? 'Le script de page est indisponible. Rechargez la page puis réessayez.' : 'The page script is unavailable. Reload the page and try again.'));
    }
  }
  async function stopAutomation() {
    try {
      const tab = await activeTab();
      const response = await browser.tabs.sendMessage(tab.id!, { type: 'CHAT_AUTOMATION_STOP' });
      setStatus(typeof response?.message === 'string' ? response.message : t('automationStopped'));
      await refreshLogs();
    } catch { setStatus(t('pageScriptUnreachable')); }
  }

  function countdownLabel(target: number | null | undefined): string {
    if (typeof target !== 'number') return t('waiting');
    const secondsLeft = Math.max(0, Math.ceil((target - clockNow) / 1000));
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    return minutes > 0 ? `${minutes} min ${String(seconds).padStart(2, '0')} s` : `${seconds} s`;
  }

  function phaseLabel(phase: RuntimeStatus['phase']): string {
    switch (phase) {
      case 'ready': return t('phaseReady');
      case 'waiting-interval': return t('phaseCountdown');
      case 'waiting-window': return t('phaseWaitingWindow');
      case 'waiting-llm': return t('waitingLLM');
      case 'sending': return t('phaseSending');
      case 'finished': return t('phaseFinished');
      case 'failed': return t('phaseFailed');
      default: return t('phaseStopped');
    }
  }

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

  return <main className={`popup-shell ${page === 'automation' ? 'automation-view' : ''} ${page === 'variables' ? 'variables-view' : ''} ${page === 'history' ? 'history-view' : ''} ${page === 'logs' ? 'logs-view' : ''} ${page === 'simulator' ? 'simulator-view' : ''}`}>
    <header className="popup-header"><div className="mark" aria-hidden="true">CA</div><div className="brand-copy"><h1>Chat Automation</h1><p>{t('subtitle')}</p></div><label className="locale-picker"><span>{t('language')}</span><select aria-label={t('language')} value={locale} onChange={event => { const next = event.target.value as Locale; setLocale(next); void browser.storage.local.set({ [LOCALE_STORAGE_KEY]: next }); }}><option value="fr">Français</option><option value="en">English</option></select></label><button type="button" className="help-button" aria-label={t('docs')} title={t('docs')} onClick={() => void browser.tabs.create({ url: browser.runtime.getURL('/documentation.html') })}>?</button></header>
    <nav className="main-nav" aria-label={t('mainNavigation')}>
      <button className={page === 'automation' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('automation')}>{t('automation')}</button>
      <button className={page === 'variables' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('variables')}>{t('variables')}</button>
      <button className={page === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('history')}>{t('history')}</button>
      <button className={page === 'logs' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('logs')}>{t('logs')}</button>
      <button className={page === 'simulator' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('simulator')}>{t('simulator')}</button>
    </nav>

    <div className="popup-content">
      {page !== 'simulator' ? <section className="site-access-control" aria-label={t('siteAccess')}>
        <button type="button" className="secondary" onClick={() => void enableActiveSite()}>{t('enableOnSite')}</button>
        {siteAccessStatus ? <p className="status" role="status">{siteAccessStatus}</p> : null}
      </section> : null}
    {page === 'automation' ? strategyReady === null ? <>
      <div className="page-heading"><h2>{t('automation')}</h2><p>{t('checkingStrategy')}</p></div>
      <p className="empty">{t('loadingSiteConfig')}</p>
    </> : strategyReady === false ? <>
      <div className="page-heading"><h2>{t('setupStrategy')}</h2><p>{t('strategyDescription')}</p></div>
      <label htmlFor="message">{t('testMessage')}</label>
      <TemplateTextarea t={t} id="message" value={message} onChange={setMessage} variables={variables} placeholder={t('writeTestMessage')} rows={4} />
      <p className="helper autocomplete-note">{t('variableHint')}</p>
      <button className="secondary validate-button" onClick={() => void validateStrategy()}>{t('testAndSave')}</button>
      <p className="notice">{t('testWarning')}</p>
      <p className="status" role="status">{status}</p>
    </> : <>
      <div className="page-heading"><h2>{t('automateSending')}</h2><p>{t('siteStrategyDescription', { site: strategyOrigin })}</p></div>
      <div className="sequence-heading"><div><h3>{t('sequence')}</h3><p className="helper">{t('sequenceHelp')}</p></div><button className="secondary add-message" onClick={addAutomationMessage}>{t('add')}</button></div>
      <div className="message-sequence" aria-label={t('sequence')}>
        {automationMessages.map((text, index) => <div
          className={draggingIndex === index ? 'sequence-item dragging' : 'sequence-item'}
          key={`sequence-${index}`}
          draggable
          onDragStart={event => { setDraggingIndex(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
          onDrop={event => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) moveAutomationMessage(from, index); setDraggingIndex(null); }}
          onDragEnd={() => setDraggingIndex(null)}
        >
          <button type="button" className="drag-handle" aria-label={t('dragMessage', { number: index + 1 })} title={t('dragToReorder')}>⠿</button>
          <span className="sequence-number">{index + 1}</span>
          <TemplateTextarea t={t} ariaLabel={`Message ${index + 1}`} className="sequence-template-input" value={text} onChange={next => updateAutomationMessage(index, next)} variables={variables} placeholder={t('messagePlaceholder', { number: index + 1 })} rows={2} />
          <button type="button" className="remove-message" aria-label={t('removeMessage', { number: index + 1 })} title={t('removeThisMessage')} onClick={() => removeAutomationMessage(index)}>×</button>
        </div>)}
      </div>
      <section className="settings-section">
        <h3>{t('cycleSettings')}</h3>
        <div className="cycle-grid">
          <div className="cycle-field"><label htmlFor="interval">{t('frequency')}</label><input id="interval" type="number" min="1" step="1" value={interval} onChange={e => setIntervalValue(e.target.value)} /></div>
          <div className="cycle-field"><label htmlFor="unit">{t('unit')}</label><select id="unit" value={unit} onChange={e => setUnit(e.target.value as 'seconds' | 'minutes')}><option value="seconds">{t('seconds')}</option><option value="minutes">{t('minutes')}</option></select></div>
          <div className="cycle-field"><label htmlFor="repeat-count">{t('cycleCount')}</label><input id="repeat-count" type="text" inputMode="numeric" pattern="[0-9]*" value={repeatCount} onChange={e => setRepeatCount(e.target.value)} aria-describedby="repeat-count-help" /></div>
        </div>
        <p id="repeat-count-help" className="helper cycle-help">{t('infiniteHelp')}</p>
        <h3>{t('dailyWindow')}</h3>
        <label className="toggle-row" htmlFor="time-window-enabled"><input id="time-window-enabled" type="checkbox" checked={timeWindowEnabled} onChange={e => setTimeWindowEnabled(e.target.checked)} /><span>{t('limitWindow')}</span></label>
        {timeWindowEnabled ? <>
          <p className="helper">{t('outsideWindow')}</p>
          <div className="field-row time-row">
            <div><label htmlFor="start-time">{t('start')}</label><input id="start-time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
            <span className="time-separator">{locale === 'fr' ? 'à' : 'to'}</span>
            <div><label htmlFor="end-time">{t('end')}</label><input id="end-time" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
          </div>
          <p className="helper">{t('windowOvernight')}</p>
        </> : <p className="helper">{t('noTimeRestriction')}</p>}
      </section>
      <p className="notice">{t('variableUsageNotice')}</p>
    </> : page === 'simulator' ? <SimulatorPage
      t={t}
      locale={locale}
      automationMessages={automationMessages}
      simulationStartAt={simulationStartAt}
      setSimulationStartAt={setSimulationStartAt}
      simulationCycles={simulationCycles}
      setSimulationCycles={setSimulationCycles}
      interval={interval}
      unit={unit}
      timeWindowEnabled={timeWindowEnabled}
      startTime={startTime}
      endTime={endTime}
      simulationContext={simulationContext}
      setSimulationContext={setSimulationContext}
      runSimulation={() => void runSimulation()}
      simulationError={simulationError}
      simulationResult={simulationResult}
    /> : page === 'variables' ? <VariablesPage
      t={t}
      editingVariableId={editingVariableId}
      variableName={variableName}
      setVariableName={setVariableName}
      variableValue={variableValue}
      setVariableValue={setVariableValue}
      variableScope={variableScope}
      setVariableScope={setVariableScope}
      variableError={variableError}
      saveVariable={() => void saveVariable()}
      cancelEditing={() => { setEditingVariableId(null); setVariableName(''); setVariableValue(''); setVariableScope('global'); setVariableError(''); }}
      variables={variables}
      editVariable={editVariable}
      deleteVariable={item => void deleteVariable(item)}
      variablePreviewText={variablePreviewText}
      setVariablePreviewText={setVariablePreviewText}
      variablePreviewResult={variablePreviewResult}
      variablePreviewError={variablePreviewError}
    /> : page === 'history' ? <HistoryPage
      t={t}
      historyConversationId={historyConversationId}
      historyOrigin={historyOrigin}
      historyError={historyError}
      historyMessages={historyMessages}
      refreshHistory={() => void refreshHistory()}
      clearSiteHistory={() => void clearSiteHistory()}
    /> : null

    {page === 'logs' ? <LogsPage
      t={t}
      logs={logs}
      refreshLogs={() => void refreshLogs()}
      clearLogs={() => void clearLogs()}
      exportLogs={() => void exportLogs()}
    /> : null}
    </div>
    {page === 'history' ? <div className="history-dock">
      <button className="secondary export-history-button" disabled={historyMessages.length === 0} onClick={() => void exportHistory()}>{t('exportHistory')}</button>
    </div> : null}
    {page === 'logs' ? <div className="logs-dock">
      <button className="secondary export-logs-button" onClick={() => void exportLogs()}>{t('exportLogs')}</button>
    </div> : null}
    {page === 'automation' && strategyReady === true ? <div className="automation-dock">
      <div className="automation-actions">
        <button className="primary" onClick={() => void startAutomation()}>{t('startAutomation')}</button>
        <button className="stop-button" onClick={() => void stopAutomation()}>{t('stopAutomation')}</button>
      </div>
      <p className="status" role="status">{status}</p>
      <section className="runtime-panel" aria-live="polite" aria-label={t('tracking')}>
        <div className="runtime-head"><h3>{t('tracking')}</h3><span className={`runtime-badge phase-${runtimeStatus?.phase ?? 'stopped'}`}>{phaseLabel(runtimeStatus?.phase ?? 'stopped')}</span></div>
        <p className="runtime-note">{runtimeStatus?.note ?? t('noRun')}</p>
        <div className="runtime-metrics">
          <div><span>{t('iteration')}</span><strong>{runtimeStatus?.phase === 'finished' ? (runtimeStatus.completedSequences || 0) : runtimeStatus && runtimeStatus.phase !== 'stopped' && runtimeStatus.phase !== 'failed' ? runtimeStatus.completedSequences + 1 : runtimeStatus?.completedSequences ?? 0}<small>{runtimeStatus?.repeatMode === 'infinite' ? ' / ∞' : runtimeStatus ? ` / ${runtimeStatus.repeatCount}` : ''}</small></strong></div>
          <div><span>{t('message')}</span><strong>{runtimeStatus?.messagesCount ? `${Math.min(runtimeStatus.messageIndex + 1, runtimeStatus.messagesCount)} / ${runtimeStatus.messagesCount}` : '—'}</strong></div>
          <div><span>{t('nextSend')}</span><strong>{runtimeStatus?.phase === 'waiting-llm' ? 'En attente du LLM' : runtimeStatus?.phase === 'sending' ? t('sending') : runtimeStatus?.phase === 'finished' || runtimeStatus?.phase === 'stopped' || runtimeStatus?.phase === 'failed' ? '—' : countdownLabel(runtimeStatus?.nextSendAt)}</strong></div>
        </div>
      </section>
    </div> : page !== 'automation' ? <p className="status detection-status" role="status">{status}</p> : null}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Popup />);
