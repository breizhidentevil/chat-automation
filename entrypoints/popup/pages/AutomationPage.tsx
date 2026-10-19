import React from 'react';
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
    </>;
}
