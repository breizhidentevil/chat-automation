import React, { useRef, useState } from 'react';
import type { VariableDefinition } from '../../../lib/variables';
import { Button, Textarea } from '@mantine/core';
import { translate } from '../../../lib/i18n';

type TemplateSuggestion = { value: string; description: string; kind: 'custom' | 'dynamic' };

const DYNAMIC_VARIABLE_SUGGESTIONS: TemplateSuggestion[] = [
  { value: 'system.runtime.timestamp', description: 'currentTimestamp', kind: 'dynamic' },
  { value: 'system.runtime.date', description: 'currentDate', kind: 'dynamic' },
  { value: 'system.runtime.time', description: 'currentTime', kind: 'dynamic' },
  { value: 'system.runtime.timezone', description: 'timezone', kind: 'dynamic' },
  { value: 'automation.sequence.iteration', description: 'currentIteration', kind: 'dynamic' },
  { value: 'automation.sequence.total_iterations', description: 'totalIterations', kind: 'dynamic' },
  { value: 'automation.message.index', description: 'currentMessageIndex', kind: 'dynamic' },
  { value: 'automation.message.total', description: 'messageCountSequence', kind: 'dynamic' },
  { value: 'automation.config.interval', description: 'configuredInterval', kind: 'dynamic' },
  { value: 'automation.messages[0].content', description: 'firstConfiguredMessage', kind: 'dynamic' },
  { value: 'chat.messages[0].content', description: 'firstChatMessage', kind: 'dynamic' },
  { value: 'chat.session.url', description: 'activeConversationUrl', kind: 'dynamic' },
  { value: 'chat.session.title', description: 'activeConversationTitle', kind: 'dynamic' },
  { value: 'chat.sent[0].content', description: 'firstSentMessage', kind: 'dynamic' },
  { value: 'chat.received[0].content', description: 'firstReceivedMessage', kind: 'dynamic' },
  { value: 'history.messages[0].content', description: 'firstHistoryMessage', kind: 'dynamic' },
  { value: 'history.messages[0].author', description: 'firstHistoryAuthor', kind: 'dynamic' },
  { value: 'history.messages[0].timestamp', description: 'firstHistoryDate', kind: 'dynamic' },
  { value: 'history.message.count', description: 'historyMessageCount', kind: 'dynamic' },
  { value: 'history.sent[0].content', description: 'firstHistorySent', kind: 'dynamic' },
  { value: 'history.received[0].content', description: 'firstHistoryReceived', kind: 'dynamic' },
  { value: 'logs.events[0].message', description: 'firstLogMessage', kind: 'dynamic' },
  { value: 'logs.events[0].level', description: 'firstLogLevel', kind: 'dynamic' },
  { value: 'logs.events[0].timestamp', description: 'firstLogDate', kind: 'dynamic' },
  { value: 'logs.errors[0].message', description: 'firstError', kind: 'dynamic' },
  { value: 'logs.warnings[0].message', description: 'firstWarning', kind: 'dynamic' },
  { value: 'strategy.site.domain', description: 'currentDomain', kind: 'dynamic' },
  { value: 'data.records[0].id', description: 'firstRecordId', kind: 'dynamic' },
];

function TemplateTextarea({
  value, onChange, variables, placeholder, rows = 3, id, ariaLabel, className = '', t,
}: {
  value: string;
  onChange: (value: string) => void;
  variables: VariableDefinition[];
  placeholder: string;
  rows?: number;
  id?: string;
  ariaLabel?: string;
  className?: string;
  t: (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const beforeCaret = value.slice(0, caret);
  const openToken = beforeCaret.match(/{{\s*([A-Za-z0-9_.\-[\]]*)$/);
  const tokenStart = openToken ? beforeCaret.lastIndexOf('{{') : -1;
  const query = openToken?.[1] ?? '';
  const candidates = React.useMemo<TemplateSuggestion[]>(() => {
    const customSuggestions: TemplateSuggestion[] = [];
    function addNestedSuggestions(root: string, value: unknown, description: string, depth = 0) {
      if (depth > 12 || value === null || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          const path = `${root}[${index}]`;
          customSuggestions.push({ value: path, description, kind: 'custom' });
          addNestedSuggestions(path, item, description, depth + 1);
        });
        return;
      }
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) continue;
        const path = `${root}.${key}`;
        customSuggestions.push({ value: path, description, kind: 'custom' });
        addNestedSuggestions(path, child, description, depth + 1);
      }
    }

    const rootSuggestions = variables.flatMap(variable => {
      const description = `${variable.scope === 'global' ? 'globalVariable' : 'automationVariable'}|${variable.value}`;
      const entries: TemplateSuggestion[] = [{ value: variable.name, description, kind: 'custom' }];
      const serialized = variable.value.trim();
      if (serialized.startsWith('{') || serialized.startsWith('[')) {
        try { addNestedSuggestions(variable.name, JSON.parse(serialized) as unknown, description); } catch { /* Keep the root suggestion for plain text. */ }
      }
      return entries;
    });

    const seen = new Set<string>();
    return [...rootSuggestions, ...customSuggestions, ...DYNAMIC_VARIABLE_SUGGESTIONS].filter(item => {
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
  }, [variables]);
  const filtered = openToken && !dismissed
    ? candidates.filter((item, index, all) => all.findIndex(other => other.value === item.value) === index && item.value.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  function updateCaret(element: HTMLTextAreaElement) {
    setCaret(element.selectionStart ?? element.value.length);
    setActiveIndex(0);
    setDismissed(false);
  }

  function insertSuggestion(suggestion: TemplateSuggestion) {
    const element = textareaRef.current;
    if (!element || tokenStart < 0) return;
    const close = value.indexOf('}}', caret);
    const end = close >= 0 ? close + 2 : caret;
    const insertion = `{{${suggestion.value}}}`;
    const next = `${value.slice(0, tokenStart)}${insertion}${value.slice(end)}`;
    const nextCaret = tokenStart + insertion.length;
    onChange(next);
    setCaret(nextCaret);
    setDismissed(true);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (filtered.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setActiveIndex(current => event.key === 'ArrowDown' ? (current + 1) % filtered.length : (current - 1 + filtered.length) % filtered.length);
      return;
    }
    if (filtered.length > 0 && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault();
      insertSuggestion(filtered[Math.min(activeIndex, filtered.length - 1)]!);
      return;
    }
    if (event.key === 'Escape' && filtered.length > 0) {
      event.preventDefault();
      setDismissed(true);
    }
  }

  return <div className={`template-input ${className}`}>
    <Textarea
      ref={textareaRef}
      classNames={{ input: 'template-textarea-input' }}
      id={id}
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-expanded={filtered.length > 0}
      value={value}
      onChange={event => { onChange(event.currentTarget.value); updateCaret(event.currentTarget); }}
      onClick={event => updateCaret(event.currentTarget)}
      onKeyUp={event => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) updateCaret(event.currentTarget); }}
      onKeyDown={handleKeyDown}
      onSelect={event => setCaret(event.currentTarget.selectionStart ?? value.length)}
      placeholder={placeholder}
      rows={rows}
      autoComplete="off"
    />
    {filtered.length > 0 ? <div className="variable-autocomplete" role="listbox" aria-label={t('suggestions')}>
      {filtered.map((item, index) => <Button
        type="button"
        variant="subtle"
        color="gray"
        size="compact-sm"
        role="option"
        aria-selected={index === activeIndex}
        className={index === activeIndex ? 'variable-suggestion active' : 'variable-suggestion'}
        key={`${item.kind}-${item.value}`}
        onMouseDown={event => event.preventDefault()}
        onClick={() => insertSuggestion(item)}
      ><span className="suggestion-main"><code>{`{{${item.value}}}`}</code><small>{t(item.kind === 'custom' ? 'variableCustom' : 'dynamicPath')}</small></span><span className="suggestion-description">{item.description.includes('|') ? `${t(item.description.split('|')[0] as Parameters<typeof translate>[1])} · ${item.description.split('|').slice(1).join('|')}` : t(item.description as Parameters<typeof translate>[1])}</span></Button>)}
      <p className="autocomplete-help">{t('navigateSuggestions')}</p>
    </div> : null}
  </div>;
}

export default TemplateTextarea;
