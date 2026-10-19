import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Badge, Button, MantineProvider, Select, Tabs, useMantineColorScheme } from '@mantine/core';
import '@mantine/core/styles.css';
import './style.css';
import './theme.css';
import { LOCALE_STORAGE_KEY, preferredLocale, translate, type Locale } from '../../lib/i18n';

import { addMessage, moveMessage, removeMessage, updateMessage } from '../../lib/message-sequence';
import { previewMessageTemplate, type TemplatePreviewResult } from '../../lib/template-preview';
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
type ColorSchemePreference = 'auto' | 'light' | 'dark';
const COLOR_SCHEME_STORAGE_KEY = 'chatAutomationColorScheme';

function isColorSchemePreference(value: unknown): value is ColorSchemePreference {
  return value === 'auto' || value === 'light' || value === 'dark';
}



function Popup() {
  const { setColorScheme, clearColorScheme } = useMantineColorScheme();
  const [colorSchemePreference, setColorSchemePreference] = useState<ColorSchemePreference>('auto');
  const [locale, setLocale] = useState<Locale>(preferredLocale(typeof navigator !== 'undefined' ? navigator.language : 'fr'));
  const t = (key: Parameters<typeof translate>[1], values: Record<string, string | number> = {}) => Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), translate(locale, key));
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  useEffect(() => {
    let active = true;
    void browser.storage.local.get(COLOR_SCHEME_STORAGE_KEY).then(stored => {
      if (!active) return;
      const saved = stored[COLOR_SCHEME_STORAGE_KEY];
      const preference = isColorSchemePreference(saved) ? saved : 'auto';
      setColorSchemePreference(preference);
      if (preference === 'auto') clearColorScheme();
      else setColorScheme(preference);
    }).catch(() => {
      if (active) clearColorScheme();
    });
    return () => { active = false; };
  }, [clearColorScheme, setColorScheme]);

  async function changeColorScheme(value: string | null) {
    if (!isColorSchemePreference(value)) return;
    setColorSchemePreference(value);
    if (value === 'auto') clearColorScheme();
    else setColorScheme(value);
    try {
      await browser.storage.local.set({ [COLOR_SCHEME_STORAGE_KEY]: value });
    } catch {
      setStatus(t('themeSaveError'));
    }
  }


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
  const { strategyReady, strategyOrigin, activeTab, refreshStrategyStatus, validateStrategy, startAutomation, stopAutomation } = useAutomationController({
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
    <header className="popup-header"><div className="mark" aria-hidden="true">CA</div><div className="brand-copy"><h1>Chat Automation</h1></div><Select className="locale-picker" aria-label={t('language')} value={locale} onChange={value => { if (value === 'fr' || value === 'en') { setLocale(value); void browser.storage.local.set({ [LOCALE_STORAGE_KEY]: value }); } }} data={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]} size="xs" /> <Select className="theme-picker" aria-label={t('appearance')} value={colorSchemePreference} onChange={value => void changeColorScheme(value)} data={[{ value: 'auto', label: t('themeAuto') }, { value: 'light', label: t('themeLight') }, { value: 'dark', label: t('themeDark') }]} size="xs" /> <Button type="button" className="help-button" variant="default" size="compact-md" aria-label={t('docs')} title={t('docs')} onClick={() => void browser.tabs.create({ url: browser.runtime.getURL('/documentation.html') })}>?</Button></header>
    <Tabs value={page} onChange={value => { if (value) setPage(value as Page); }} className="popup-tabs">
      <Tabs.List className="main-nav" aria-label={t('mainNavigation')}>
        <Tabs.Tab value="automation">{t('automation')}</Tabs.Tab>
        <Tabs.Tab value="variables">{t('variables')}</Tabs.Tab>
        <Tabs.Tab value="history">{t('history')}</Tabs.Tab>
        <Tabs.Tab value="logs">{t('logs')}</Tabs.Tab>
        <Tabs.Tab value="simulator">{t('simulator')}</Tabs.Tab>
      </Tabs.List>
    </Tabs>

    <div className="popup-content">
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
      <Button className="export-history-button" variant="default" fullWidth disabled={historyMessages.length === 0} onClick={() => void exportHistory()}>{t('exportHistory')}</Button>
    </div> : null}
    {page === 'logs' ? <div className="logs-dock">
      <Button className="export-logs-button" variant="default" fullWidth onClick={() => void exportLogs()}>{t('exportLogs')}</Button>
    </div> : null}
    {page === 'automation' && strategyReady === true ? <div className="automation-dock">
      <div className="automation-actions">
        <Button color="dark" fullWidth onClick={() => void startAutomation()}>{t('startAutomation')}</Button>
        <Button color="red" variant="outline" fullWidth onClick={() => void stopAutomation()}>{t('stopAutomation')}</Button>
      </div>
      <p className="status" role="status">{status}</p>
      <section className="runtime-panel" aria-live="polite" aria-label={t('tracking')}>
        <div className="runtime-head"><h3>{t('tracking')}</h3><Badge className={`runtime-badge phase-${runtimeStatus?.phase ?? 'stopped'}`} variant="light" color={runtimeStatus?.phase === 'failed' ? 'red' : runtimeStatus?.phase === 'finished' ? 'blue' : runtimeStatus?.phase === 'sending' || runtimeStatus?.phase === 'ready' ? 'green' : 'gray'}>{phaseLabel(runtimeStatus?.phase ?? 'stopped')}</Badge></div>
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

createRoot(document.getElementById('root')!).render(
  <MantineProvider defaultColorScheme="auto" theme={{ primaryColor: 'blue', fontFamily: 'Inter, system-ui, sans-serif', defaultRadius: 'md' }}>
    <Popup />
  </MantineProvider>,
);
