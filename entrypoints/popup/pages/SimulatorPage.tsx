import React from 'react';
import { Alert, Button, Card, NumberInput, Paper, Textarea, TextInput } from '@mantine/core';
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

function formatSimulationDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours} h` : '', minutes ? `${minutes} min` : '', `${seconds} s`].filter(Boolean).join(' ');
}

export default function SimulatorPage({
  t, locale, automationMessages, simulationStartAt, setSimulationStartAt,
  simulationCycles, setSimulationCycles, interval, unit, timeWindowEnabled,
  startTime, endTime, simulationContext, setSimulationContext, runSimulation,
  simulationError, simulationResult,
}: SimulatorPageProps) {
  return <>

      <div className="page-heading"><h2>{t('simulator')}</h2><p>{t('simulatorIntro')}</p></div>
      <Alert className="simulator-safety-note" color="teal" variant="light">{t('simulatorIsolation')}</Alert>
      <section className="simulator-settings">
        <h3>{t('simulationMessages')}</h3>
        {automationMessages.length === 0 ? <p className="empty">{t('sequenceEmpty')}</p> : <ol className="simulation-message-list">{automationMessages.map((item, index) => <li key={index}><strong>{index + 1}.</strong><code>{item || t('emptyMessage')}</code></li>)}</ol>}
        <p className="helper">{t('simulationFromSettings')}</p>
        <div className="field-row">
          <div className="field-grow"><TextInput id="simulation-start" type="datetime-local" label={t('simulationStart')} value={simulationStartAt} onChange={event => setSimulationStartAt(event.currentTarget.value)} /></div>
          <div className="simulation-cycle-field"><NumberInput id="simulation-cycles" label={t('simulationCycles')} min={1} max={10} step={1} allowDecimal={false} allowNegative={false} value={simulationCycles} onChange={value => setSimulationCycles(String(value))} /></div>
        </div>
        <p className="helper">{t('simulationInterval', { interval: intervalAmountLabel(interval, unit, locale) })}</p>
        {timeWindowEnabled ? <p className="helper">{t('simulationWindow', { start: startTime, end: endTime })}</p> : <p className="helper">{t('noTimeRestriction')}</p>}
      </section>
      <section className="simulator-context">
        <label htmlFor="simulation-context">{t('simulationContext')}</label>
        <p className="helper">{t('simulationContextHelp')}</p>
        <Textarea id="simulation-context" className="simulation-context-input" rows={7} spellCheck={false} autosize minRows={7} maxRows={14} value={simulationContext} onChange={event => setSimulationContext(event.currentTarget.value)} />
      </section>
      <Button className="primary" onClick={() => void runSimulation()}>{t('runSimulation')}</Button>
      {simulationError ? <Alert className="simulation-error" color="red" variant="light" role="alert">{simulationError}</Alert> : null}
      {simulationResult ? <>
        <section className="simulation-summary" aria-live="polite">
          <h3>{t('simulationResults')}</h3>
          <div className="simulation-metrics">
            <Paper component="div" padding="xs" withBorder><span>{t('simulationSuccessful')}</span><strong>{simulationResult.successful}</strong></Paper>
            <Paper component="div" padding="xs" withBorder><span>{t('simulationFailed')}</span><strong>{simulationResult.failed}</strong></Paper>
            <Paper component="div" padding="xs" withBorder><span>{t('simulationDuration')}</span><strong>{formatSimulationDuration(simulationResult.simulatedDurationMs)}</strong></Paper>
          </div>
          <p className="helper">{new Date(simulationResult.startedAt).toLocaleString()} → {new Date(simulationResult.finishedAt).toLocaleString()}</p>
        </section>
        <section className="simulation-timeline">
          <h3>{t('simulationTimeline')}</h3>
          {simulationResult.entries.map((entry, index) => <Card component="article" className={entry.error ? 'simulation-entry failed' : 'simulation-entry'} key={index} padding="sm" withBorder>
            <div className="simulation-entry-head"><strong>{t('simulationEntry', { cycle: entry.cycle, message: entry.messageIndex })}</strong><time>{new Date(entry.scheduledAt).toLocaleString()}</time></div>
            <p className="simulation-template"><span>{t('simulationTemplate')}</span><code>{entry.template}</code></p>
            {entry.error ? <p className="simulation-entry-error">{entry.error}</p> : <p className="simulation-rendered"><span>{t('simulationRendered')}</span><code>{entry.renderedText || t('simulationNoOutput')}</code></p>}
            {entry.variablesUsed?.length ? <small>{t('simulationVariables', { names: entry.variablesUsed.join(', ') })}</small> : null}
          </Card>)}
        </section>
      </> : null}
    
  </>;
}
