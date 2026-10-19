import React from 'react';
import { Alert, Button, NumberInput, Select, Switch, TextInput } from '@mantine/core';
import type { VariableDefinition } from '../../../lib/variables';
import type { Locale } from '../../../lib/i18n';
import { translate } from '../../../lib/i18n';
import TemplateTextarea from '../components/TemplateTextarea';

type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;

interface AutomationPageProps {
  t: Translate;
  locale: Locale;
  strategyReady: boolean | null;
  strategyOrigin: string;
  message: string;
  setMessage: (value: string) => void;
  variables: VariableDefinition[];
  validateStrategy: () => void;
  status: string;
  siteAccessStatus: string;
  enableActiveSite: () => void;
  automationMessages: string[];
  draggingIndex: number | null;
  setDraggingIndex: (value: number | null) => void;
  addAutomationMessage: () => void;
  updateAutomationMessage: (index: number, value: string) => void;
  removeAutomationMessage: (index: number) => void;
  moveAutomationMessage: (from: number, to: number) => void;
  interval: string;
  setIntervalValue: (value: string) => void;
  unit: 'seconds' | 'minutes';
  setUnit: (value: 'seconds' | 'minutes') => void;
  repeatCount: string;
  setRepeatCount: (value: string) => void;
  timeWindowEnabled: boolean;
  setTimeWindowEnabled: (value: boolean) => void;
  startTime: string;
  setStartTime: (value: string) => void;
  endTime: string;
  setEndTime: (value: string) => void;
}

export default function AutomationPage(props: AutomationPageProps) {
  const {
    t, locale, strategyReady, strategyOrigin, message, setMessage, variables,
    validateStrategy, status, siteAccessStatus, enableActiveSite, automationMessages,
    draggingIndex, setDraggingIndex, addAutomationMessage, updateAutomationMessage,
    removeAutomationMessage, moveAutomationMessage, interval, setIntervalValue, unit,
    setUnit, repeatCount, setRepeatCount, timeWindowEnabled, setTimeWindowEnabled,
    startTime, setStartTime, endTime, setEndTime,
  } = props;
  return strategyReady === null ? <>
      <div className="page-heading"><h2>{t('automation')}</h2></div>
      <p className="empty">{t('loadingSiteConfig')}</p>
    </> : strategyReady === false ? <>
      <div className="page-heading"><h2>{t('setupStrategy')}</h2></div>
      <label htmlFor="message">{t('testMessage')}</label>
      <TemplateTextarea t={t} id="message" value={message} onChange={setMessage} variables={variables} placeholder={t('writeTestMessage')} rows={4} />
      <p className="helper autocomplete-note">{t('variableHint')}</p>
      <Button className="validate-button" variant="default" fullWidth onClick={() => void validateStrategy()}>{t('testAndSave')}</Button>
      <Alert color="yellow" variant="light">{t('testWarning')}</Alert>
      <Alert color="gray" variant="light" role="status">{status}</Alert>
    </> : <>
      <div className="page-heading"><h2>{t('automateSending')}</h2><span className="site-origin">{strategyOrigin}</span></div>
      <div className="sequence-heading"><div><h3>{t('sequence')}</h3></div><Button className="add-message" variant="default" size="compact-sm" onClick={addAutomationMessage}>{t('add')}</Button></div>
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
          <Button type="button" className="drag-handle" variant="subtle" size="compact-xs" aria-label={t('dragMessage', { number: index + 1 })} title={t('dragToReorder')}>⠿</Button>
          <span className="sequence-number">{index + 1}</span>
          <TemplateTextarea t={t} ariaLabel={`Message ${index + 1}`} className="sequence-template-input" value={text} onChange={next => updateAutomationMessage(index, next)} variables={variables} placeholder={t('messagePlaceholder', { number: index + 1 })} rows={2} />
          <Button type="button" className="remove-message" color="red" variant="subtle" size="compact-xs" aria-label={t('removeMessage', { number: index + 1 })} title={t('removeThisMessage')} onClick={() => removeAutomationMessage(index)}>×</Button>
        </div>)}
      </div>
      <section className="settings-section">
        <h3>{t('cycleSettings')}</h3>
        <div className="cycle-grid">
          <div className="cycle-field"><NumberInput id="interval" label={t('frequency')} min={1} step={1} allowDecimal={false} allowNegative={false} value={interval} onChange={value => setIntervalValue(String(value))} /></div>
          <div className="cycle-field"><Select id="unit" label={t('unit')} value={unit} onChange={value => { if (value === 'seconds' || value === 'minutes') setUnit(value); }} data={[{ value: 'seconds', label: t('seconds') }, { value: 'minutes', label: t('minutes') }]} /></div>
          <div className="cycle-field"><TextInput id="repeat-count" label={t('cycleCount')} inputMode="numeric" pattern="[0-9]*" value={repeatCount} onChange={e => setRepeatCount(e.currentTarget.value)} aria-describedby="repeat-count-help" /></div>
        </div>

        <h3>{t('dailyWindow')}</h3>
        <Switch id="time-window-enabled" className="toggle-row" checked={timeWindowEnabled} onChange={e => setTimeWindowEnabled(e.currentTarget.checked)} label={t('limitWindow')} />
        {timeWindowEnabled ? <>

          <div className="field-row time-row">
            <div><TextInput id="start-time" type="time" label={t('start')} value={startTime} onChange={e => setStartTime(e.currentTarget.value)} /></div>
            <span className="time-separator">{locale === 'fr' ? 'à' : 'to'}</span>
            <div><TextInput id="end-time" type="time" label={t('end')} value={endTime} onChange={e => setEndTime(e.currentTarget.value)} /></div>
          </div>

        </> : null}
      </section>

    </>;
}
