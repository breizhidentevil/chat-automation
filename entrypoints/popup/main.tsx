import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { LOCALE_STORAGE_KEY, preferredLocale, translate, type Locale } from '../../lib/i18n';

import { addMessage, moveMessage, removeMessage, updateMessage } from '../../lib/message-sequence';
import { previewMessageTemplate, type TemplatePreviewResult } from '../../lib/template-preview';
import TemplateTextarea from './components/TemplateTextarea';
import SimulatorPage from './pages/SimulatorPage';
import HistoryPage from './pages/HistoryPage';
import LogsPage from './pages/LogsPage';
import VariablesPage from './pages/VariablesPage';
import AutomationPage from './pages/AutomationPage';
import { useRuntimeStatus, type RuntimeStatus } from './hooks/useRuntimeStatus';
import { useVariables } from './hooks/useVariables';
import { useAutomationSettings } from './hooks/useAutomationSettings';
import { useHistory } from './hooks/useHistory';
import { useLogs } from './hooks/useLogs';
import { useSimulation } from './hooks/useSimulation';
import { useAutomationController } from './hooks/useAutomationController';

type Page = 'automation' | 'variables' | 'history' | 'logs' | 'simulator';



function Popup() {
  const [locale, setLocale] = useState<Locale>(preferredLocale(typeof navigator !== 'undefined' ? navigator.language : 'fr'));
  const t = (key: Parameters<typeof translate>[1], values: Record<string, string | number> = {}) => Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), translate(locale, key));
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);


  const [page, setPage] = useState<Page>('automation');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [status, setStatus] = useState(preferredLocale(typeof navigator !== 'undefined' ? navigator.language : 'fr') === 'fr' ? 'Prêt. Ouvrez une page contenant un chat.' : 'Ready. Open a page containing a chat.');
  const [variablePreviewText, setVariablePreviewText] = useState('Bonjour {{prenom}}');
  const [variablePreviewResult, setVariablePreviewResult] = useState<TemplatePreviewResult | null>(null);
  const [variablePreviewError, setVariablePreviewError] = useState('');
  const { runtimeStatus, clockNow } = useRuntimeStatus(() => setStatus(t('automationStatusReadError')));
  const { message, setMessage, automationMessages, setAutomationMessages, interval, setIntervalValue, unit, setUnit, repeatCount, setRepeatCount, timeWindowEnabled, setTimeWindowEnabled, startTime, setStartTime, endTime, setEndTime, persistSettings } = useAutomationSettings(
    () => setStatus(t('settingsReadError')),
    () => setStatus(t('settingsSaveError')),
  );
  const { variables, variableName, setVariableName, variableValue, setVariableValue, variableScope, setVariableScope, editingVariableId, variableError, saveVariable, editVariable, deleteVariable, cancelEditing } = useVariables({ t, locale, onSaved: name => setStatus(t('testSaved', { name })) });
  const { simulationContext, setSimulationContext, simulationStartAt, setSimulationStartAt, simulationCycles, setSimulationCycles, simulationResult, simulationError, runSimulation } = useSimulation({
    automationMessages, variables, interval, unit, timeWindowEnabled, startTime, endTime, t,
  });
  const { logs, refreshLogs, clearLogs, exportLogs } = useLogs({
    enabled: page === 'logs',
    t,
    setStatus,
  });
  const { strategyReady, strategyOrigin, siteAccessStatus, activeTab, refreshStrategyStatus, enableActiveSite, validateStrategy, startAutomation, stopAutomation } = useAutomationController({
    t, locale, message, automationMessages, interval, unit, repeatCount,
    timeWindowEnabled, startTime, endTime, variables, persistSettings, refreshLogs,
    setStatus, setPage,
  });
  const { historyMessages, historyOrigin, historyConversationId, historyError, refreshHistory, clearSiteHistory, exportHistory } = useHistory({
    enabled: page === 'history',
    t,
    activeTab,
    setStatus,
  });

  useEffect(() => {
    if (page === 'automation') void refreshStrategyStatus();
  }, [page]);

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
    {page === 'automation' ? <AutomationPage
      t={t}
      locale={locale}
      strategyReady={strategyReady}
      strategyOrigin={strategyOrigin}
      message={message}
      setMessage={setMessage}
      variables={variables}
      validateStrategy={() => void validateStrategy()}
      status={status}
      siteAccessStatus={siteAccessStatus}
      enableActiveSite={() => void enableActiveSite()}
      automationMessages={automationMessages}
      draggingIndex={draggingIndex}
      setDraggingIndex={setDraggingIndex}
      addAutomationMessage={addAutomationMessage}
      updateAutomationMessage={updateAutomationMessage}
      removeAutomationMessage={removeAutomationMessage}
      moveAutomationMessage={moveAutomationMessage}
      interval={interval}
      setIntervalValue={setIntervalValue}
      unit={unit}
      setUnit={setUnit}
      repeatCount={repeatCount}
      setRepeatCount={setRepeatCount}
      timeWindowEnabled={timeWindowEnabled}
      setTimeWindowEnabled={setTimeWindowEnabled}
      startTime={startTime}
      setStartTime={setStartTime}
      endTime={endTime}
      setEndTime={setEndTime}
    />: page === 'simulator' ? <SimulatorPage
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
      locale={locale}
      editingVariableId={editingVariableId}
      variableName={variableName}
      setVariableName={setVariableName}
      variableValue={variableValue}
      setVariableValue={setVariableValue}
      variableScope={variableScope}
      setVariableScope={setVariableScope}
      variableError={variableError}
      saveVariable={() => void saveVariable()}
      cancelEditing={cancelEditing}
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
    /> : null}

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
