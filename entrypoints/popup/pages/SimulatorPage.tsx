import React from 'react';
import type { Locale } from '../../../lib/i18n';
import { translate } from '../../../lib/i18n';
import type { SimulationResult } from '../../../lib/simulator';

type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;

interface SimulatorPageProps {
  t: Translate;
  locale: Locale;
  automationMessages: string[];
  simulationStartAt: string;
  setSimulationStartAt: (value: string) => void;
  simulationCycles: string;
  setSimulationCycles: (value: string) => void;
  interval: string;
  unit: 'seconds' | 'minutes';
  timeWindowEnabled: boolean;
  startTime: string;
  endTime: string;
  simulationContext: string;
  setSimulationContext: (value: string) => void;
  runSimulation: () => void;
  simulationError: string;
  simulationResult: SimulationResult | null;
}

function intervalAmountLabel(value: string, unit: 'seconds' | 'minutes', locale: Locale): string {
  return `${value} ${unit === 'seconds' ? (locale === 'fr' ? 'seconde(s)' : 'second(s)') : (locale === 'fr' ? 'minute(s)' : 'minute(s)')}`;
}

function formatSimulationDuration(ms: number, locale: Locale): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return locale === 'fr'
    ? [hours ? `${hours} h` : '', minutes ? `${minutes} min` : '', `${seconds} s`].filter(Boolean).join(' ')
    : [hours ? `${hours} h` : '', minutes ? `${minutes} min` : '', `${seconds} s`].filter(Boolean).join(' ');
}

export default function SimulatorPage({
  t, locale, automationMessages, simulationStartAt, setSimulationStartAt,
  simulationCycles, setSimulationCycles, interval, unit, timeWindowEnabled,
  startTime, endTime, simulationContext, setSimulationContext, runSimulation,
  simulationError, simulationResult,
}: SimulatorPageProps) {
  return <>

      <div className="page-heading"><h2>{t('simulator')}</h2><p>{t('simulatorIntro')}</p></div>
      <p className="simulator-safety-note">{t('simulatorIsolation')}</p>
      <section className="simulator-settings">
        <h3>{t('simulationMessages')}</h3>
        {automationMessages.length === 0 ? <p className="empty">{t('sequenceEmpty')}</p> : <ol className="simulation-message-list">{automationMessages.map((item, index) => <li key={index}><strong>{index + 1}.</strong><code>{item || t('emptyMessage')}</code></li>)}</ol>}
        <p className="helper">{t('simulationFromSettings')}</p>
        <div className="field-row">
          <div className="field-grow"><label htmlFor="simulation-start">{t('simulationStart')}</label><input id="simulation-start" type="datetime-local" value={simulationStartAt} onChange={event => setSimulationStartAt(event.target.value)} /></div>
          <div className="simulation-cycle-field"><label htmlFor="simulation-cycles">{t('simulationCycles')}</label><input id="simulation-cycles" type="number" min="1" max="10" step="1" value={simulationCycles} onChange={event => setSimulationCycles(event.target.value)} /></div>
        </div>
        <p className="helper">{t('simulationInterval', { interval: intervalAmountLabel(interval, unit, locale) })}</p>
        {timeWindowEnabled ? <p className="helper">{t('simulationWindow', { start: startTime, end: endTime })}</p> : <p className="helper">{t('noTimeRestriction')}</p>}
      </section>
      <section className="simulator-context">
        <label htmlFor="simulation-context">{t('simulationContext')}</label>
        <p className="helper">{t('simulationContextHelp')}</p>
        <textarea id="simulation-context" className="simulation-context-input" rows={7} spellCheck={false} value={simulationContext} onChange={event => setSimulationContext(event.target.value)} />
      </section>
      <button className="primary" onClick={() => void runSimulation()}>{t('runSimulation')}</button>
      {simulationError ? <p className="simulation-error" role="alert">{simulationError}</p> : null}
      {simulationResult ? <>
        <section className="simulation-summary" aria-live="polite">
          <h3>{t('simulationResults')}</h3>
          <div className="simulation-metrics">
            <div><span>{t('simulationSuccessful')}</span><strong>{simulationResult.successful}</strong></div>
            <div><span>{t('simulationFailed')}</span><strong>{simulationResult.failed}</strong></div>
            <div><span>{t('simulationDuration')}</span><strong>{formatSimulationDuration(simulationResult.simulatedDurationMs, locale)}</strong></div>
          </div>
          <p className="helper">{new Date(simulationResult.startedAt).toLocaleString()} → {new Date(simulationResult.finishedAt).toLocaleString()}</p>
        </section>
        <section className="simulation-timeline">
          <h3>{t('simulationTimeline')}</h3>
          {simulationResult.entries.map((entry, index) => <article className={entry.error ? 'simulation-entry failed' : 'simulation-entry'} key={index}>
            <div className="simulation-entry-head"><strong>{t('simulationEntry', { cycle: entry.cycle, message: entry.messageIndex })}</strong><time>{new Date(entry.scheduledAt).toLocaleString()}</time></div>
            <p className="simulation-template"><span>{t('simulationTemplate')}</span><code>{entry.template}</code></p>
            {entry.error ? <p className="simulation-entry-error">{entry.error}</p> : <p className="simulation-rendered"><span>{t('simulationRendered')}</span><code>{entry.renderedText || t('simulationNoOutput')}</code></p>}
            {entry.variablesUsed?.length ? <small>{t('simulationVariables', { names: entry.variablesUsed.join(', ') })}</small> : null}
          </article>)}
        </section>
      </> : null}
    
  </>;
}
