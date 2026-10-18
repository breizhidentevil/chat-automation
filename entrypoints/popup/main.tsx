import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { deduplicateConversationMessages, historyStorageKey, type ConversationMessage } from '../../lib/history';
import { validateTemplateVariables, VARIABLE_NAME_PATTERN, VARIABLES_STORAGE_KEY, type VariableDefinition, type VariableScope } from '../../lib/variables';

type LogEntry = { timestamp: number; level: string; site: string; event: string; details?: string };
type Page = 'automation' | 'variables' | 'history' | 'logs';
type SavedSettings = { message?: string; messages?: string[]; interval?: string; unit?: 'seconds' | 'minutes'; repeatMode?: 'infinite' | 'finite'; repeatCount?: string | number; timeWindowEnabled?: boolean; startTime?: string; endTime?: string };
type RuntimeStatus = { phase: 'stopped' | 'ready' | 'waiting-interval' | 'waiting-window' | 'waiting-llm' | 'sending' | 'finished' | 'failed'; note: string; messageIndex: number; messagesCount: number; completedSequences: number; repeatMode: 'infinite' | 'finite'; repeatCount: number; nextSendAt: number | null; updatedAt: number };


type TemplateSuggestion = { value: string; description: string; kind: 'Variable personnalisée' | 'Chemin dynamique' };

const DYNAMIC_VARIABLE_SUGGESTIONS: TemplateSuggestion[] = [
  { value: 'system.runtime.timestamp', description: 'Date et heure actuelles au format ISO', kind: 'Chemin dynamique' },
  { value: 'system.runtime.date', description: 'Date actuelle', kind: 'Chemin dynamique' },
  { value: 'system.runtime.time', description: 'Heure actuelle', kind: 'Chemin dynamique' },
  { value: 'system.runtime.timezone', description: 'Fuseau horaire', kind: 'Chemin dynamique' },
  { value: 'automation.sequence.iteration', description: 'Itération actuelle', kind: 'Chemin dynamique' },
  { value: 'automation.sequence.total_iterations', description: 'Nombre total d’itérations configurées', kind: 'Chemin dynamique' },
  { value: 'automation.message.index', description: 'Index du message courant', kind: 'Chemin dynamique' },
  { value: 'automation.message.total', description: 'Nombre de messages dans la séquence', kind: 'Chemin dynamique' },
  { value: 'automation.config.interval', description: 'Intervalle configuré entre les envois', kind: 'Chemin dynamique' },
  { value: 'automation.messages[0].content', description: 'Contenu du premier message configuré', kind: 'Chemin dynamique' },
  { value: 'chat.messages[0].content', description: 'Contenu du premier message du chat', kind: 'Chemin dynamique' },
  { value: 'chat.session.url', description: 'URL de la conversation active', kind: 'Chemin dynamique' },
  { value: 'chat.session.title', description: 'Titre de la conversation active', kind: 'Chemin dynamique' },
  { value: 'chat.sent[0].content', description: 'Premier message envoyé dans le chat', kind: 'Chemin dynamique' },
  { value: 'chat.received[0].content', description: 'Premier message reçu dans le chat', kind: 'Chemin dynamique' },
  { value: 'history.messages[0].content', description: 'Premier message de l’historique', kind: 'Chemin dynamique' },
  { value: 'history.messages[0].author', description: 'Auteur du premier message', kind: 'Chemin dynamique' },
  { value: 'history.messages[0].timestamp', description: 'Date du premier message', kind: 'Chemin dynamique' },
  { value: 'history.message.count', description: 'Nombre de messages dans l’historique', kind: 'Chemin dynamique' },
  { value: 'history.sent[0].content', description: 'Premier message envoyé dans l’historique', kind: 'Chemin dynamique' },
  { value: 'history.received[0].content', description: 'Premier message reçu dans l’historique', kind: 'Chemin dynamique' },
  { value: 'logs.events[0].message', description: 'Message du premier événement de log', kind: 'Chemin dynamique' },
  { value: 'logs.events[0].level', description: 'Niveau du premier événement de log', kind: 'Chemin dynamique' },
  { value: 'logs.events[0].timestamp', description: 'Date du premier événement de log', kind: 'Chemin dynamique' },
  { value: 'logs.errors[0].message', description: 'Message de la première erreur', kind: 'Chemin dynamique' },
  { value: 'logs.warnings[0].message', description: 'Message du premier avertissement', kind: 'Chemin dynamique' },
  { value: 'strategy.site.domain', description: 'Domaine du site courant', kind: 'Chemin dynamique' },
  { value: 'data.records[0].id', description: 'Identifiant du premier enregistrement disponible', kind: 'Chemin dynamique' },
];

function TemplateTextarea({
  value, onChange, variables, placeholder, rows = 3, id, ariaLabel, className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  variables: VariableDefinition[];
  placeholder: string;
  rows?: number;
  id?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const beforeCaret = value.slice(0, caret);
  const openToken = beforeCaret.match(/{{\s*([A-Za-z0-9_.\-[\]]*)$/);
  const tokenStart = openToken ? beforeCaret.lastIndexOf('{{') : -1;
  const query = openToken?.[1] ?? '';
  const candidates: TemplateSuggestion[] = [
    ...variables.map(variable => ({ value: variable.name, description: `${variable.scope === 'global' ? 'Variable globale' : 'Variable d’automatisation'} · ${variable.value}`, kind: 'Variable personnalisée' as const })),
    ...DYNAMIC_VARIABLE_SUGGESTIONS,
  ];
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
    <textarea
      ref={textareaRef}
      id={id}
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-expanded={filtered.length > 0}
      value={value}
      onChange={event => { onChange(event.target.value); updateCaret(event.target); }}
      onClick={event => updateCaret(event.currentTarget)}
      onKeyUp={event => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) updateCaret(event.currentTarget); }}
      onKeyDown={handleKeyDown}
      onSelect={event => setCaret(event.currentTarget.selectionStart ?? value.length)}
      placeholder={placeholder}
      rows={rows}
      autoComplete="off"
    />
    {filtered.length > 0 ? <div className="variable-autocomplete" role="listbox" aria-label="Suggestions de variables">
      {filtered.map((item, index) => <button
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        className={index === activeIndex ? 'variable-suggestion active' : 'variable-suggestion'}
        key={`${item.kind}-${item.value}`}
        onMouseDown={event => event.preventDefault()}
        onClick={() => insertSuggestion(item)}
      ><span className="suggestion-main"><code>{`{{${item.value}}}`}</code><small>{item.kind}</small></span><span className="suggestion-description">{item.description}</span></button>)}
      <p className="autocomplete-help">↑ ↓ pour naviguer · Entrée ou Tab pour insérer · Échap pour fermer</p>
    </div> : null}
  </div>;
}

function Popup() {
  const [page, setPage] = useState<Page>('automation');
  const [strategyReady, setStrategyReady] = useState<boolean | null>(null);
  const [strategyOrigin, setStrategyOrigin] = useState('');
  const [message, setMessage] = useState('');
  const [automationMessages, setAutomationMessages] = useState<string[]>(['']);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [status, setStatus] = useState('Prêt. Ouvrez une page contenant un chat.');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [historyMessages, setHistoryMessages] = useState<ConversationMessage[]>([]);
  const [variables, setVariables] = useState<VariableDefinition[]>([]);
  const [variableName, setVariableName] = useState('');
  const [variableValue, setVariableValue] = useState('');
  const [variableScope, setVariableScope] = useState<VariableScope>('global');
  const [editingVariableId, setEditingVariableId] = useState<string | null>(null);
  const [variableError, setVariableError] = useState('');
  const [variablePreviewText, setVariablePreviewText] = useState('Bonjour {{prenom}}');
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

  async function refreshStrategyStatus() {
    try {
      const tab = await activeTab();
      const origin = new URL(tab.url!).origin;
      setStrategyOrigin(origin);
      const data = await browser.storage.local.get('chatAutomationProcedures');
      const procedures = (data.chatAutomationProcedures as Record<string, { schemaVersion?: number }> | undefined) ?? {};
      setStrategyReady(procedures[origin]?.schemaVersion === 2);
    } catch {
      setStrategyOrigin('');
      setStrategyReady(false);
      setStatus('Ouvrez un onglet de chat HTTP ou HTTPS pour configurer la stratégie.');
    }
  }

  async function refreshLogs() {
    const data = await browser.storage.local.get('chatAutomationLogs');
    setLogs((data.chatAutomationLogs as LogEntry[] | undefined ?? []).slice(-30).reverse());
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
      const key = historyStorageKey(origin);
      const data = await browser.storage.local.get(key);
      const items = Array.isArray(data[key]) ? data[key] as ConversationMessage[] : [];
      const siteItems = deduplicateConversationMessages(items.filter(item => item.origin === origin));
      const exactConversation = siteItems.filter(item => item.conversationId === conversationId);
      // Les applications SPA peuvent modifier l’URL (paramètres, hash ou route interne)
      // après la capture. Si aucune entrée ne correspond à l’URL actuelle, ne pas
      // masquer tout l’historique du site : afficher les messages les plus récents.
      const visibleItems = exactConversation.length > 0 ? exactConversation : siteItems;
      setHistoryMessages(visibleItems.slice().sort((a, b) => a.firstSeenAt - b.firstSeenAt).slice(-300).reverse());
    } catch (error) {
      setHistoryMessages([]);
      setHistoryOrigin('');
      setHistoryConversationId('');
      setHistoryError(error instanceof Error ? error.message : 'Impossible de charger l’historique de ce site.');
    }
  }

  async function exportHistory() {
    const key = historyStorageKey(historyOrigin);
    const data = await browser.storage.local.get(key);
    const allItems = Array.isArray(data[key]) ? data[key] as ConversationMessage[] : [];
    const siteItems = deduplicateConversationMessages(allItems.filter(item => item.origin === historyOrigin));
    const exactConversation = siteItems.filter(item => item.conversationId === historyConversationId);
    const selectedItems = exactConversation.length > 0 ? exactConversation : siteItems;
    const payload = { origin: historyOrigin, conversationId: historyConversationId, exportedAt: new Date().toISOString(), messages: selectedItems.sort((a, b) => a.firstSeenAt - b.firstSeenAt) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `chat-history-${historyOrigin.replace(/[^a-z0-9.-]+/gi, '-') || 'site'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    void refreshLogs();
    void browser.storage.local.get(VARIABLES_STORAGE_KEY).then(data => {
      const saved = data[VARIABLES_STORAGE_KEY];
      if (Array.isArray(saved)) setVariables(saved.filter((item): item is VariableDefinition => !!item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.value === 'string' && item.type === 'static' && (item.scope === 'global' || item.scope === 'automation')));
    });
    void browser.storage.local.get('chatAutomationSettings').then(({ chatAutomationSettings }) => {
      const saved = chatAutomationSettings as SavedSettings | undefined;
      if (!saved) return;
      setMessage(saved.message ?? '');
      setAutomationMessages(Array.isArray(saved.messages) && saved.messages.length > 0 ? saved.messages : [saved.message ?? '']);
      setIntervalValue(saved.interval ?? '30'); setUnit(saved.unit ?? 'seconds');
      const savedCount = saved.repeatCount;
      // Migration des paramètres des versions précédentes qui utilisaient un choix Infini/Fini.
      const migratedCount = saved.repeatMode === 'infinite' ? '0' : (savedCount !== undefined ? String(savedCount) : '0');
      setRepeatCount(migratedCount);
      setTimeWindowEnabled(saved.timeWindowEnabled ?? true);
      setStartTime(saved.startTime ?? '09:00'); setEndTime(saved.endTime ?? '18:00');
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
      const data = await browser.storage.local.get('chatAutomationRuntimeStatus');
      if (mounted) setRuntimeStatus((data.chatAutomationRuntimeStatus as RuntimeStatus | undefined) ?? null);
    };
    void refreshRuntimeStatus();
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
      void refreshRuntimeStatus();
    }, 500);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  async function persistSettings() {
    await browser.storage.local.set({ chatAutomationSettings: { message, messages: automationMessages, interval, unit, repeatCount, timeWindowEnabled, startTime, endTime } });
  }

  async function persistVariables(next: VariableDefinition[]) {
    setVariables(next);
    await browser.storage.local.set({ [VARIABLES_STORAGE_KEY]: next });
  }

  async function saveVariable() {
    setVariableError('');
    const name = variableName.trim();
    if (!VARIABLE_NAME_PATTERN.test(name)) { setVariableError('Nom invalide. Utilisez une lettre ou _ au début, puis des lettres, chiffres, _ ou -.'); return; }
    if (!variableValue.trim()) { setVariableError('La valeur ne peut pas être vide.'); return; }
    if (variables.some(item => item.name === name && item.scope === variableScope && item.id !== editingVariableId)) { setVariableError('Une variable portant ce nom existe déjà dans cette portée.'); return; }
    const item: VariableDefinition = { id: editingVariableId ?? `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, type: 'static', value: variableValue, scope: variableScope, updatedAt: Date.now() };
    const next = editingVariableId ? variables.map(existing => existing.id === editingVariableId ? item : existing) : [...variables, item];
    await persistVariables(next);
    setVariableName(''); setVariableValue(''); setVariableScope('global'); setEditingVariableId(null);
    setStatus(`Variable « ${name} » enregistrée.`);
  }

  function editVariable(item: VariableDefinition) {
    setEditingVariableId(item.id); setVariableName(item.name); setVariableValue(item.value); setVariableScope(item.scope); setVariableError('');
  }

  async function deleteVariable(item: VariableDefinition) {
    if (!window.confirm(`Supprimer la variable « ${item.name} » ? Les messages qui l’utilisent devront être corrigés avant leur envoi.`)) return;
    await persistVariables(variables.filter(existing => existing.id !== item.id));
    if (editingVariableId === item.id) { setEditingVariableId(null); setVariableName(''); setVariableValue(''); setVariableScope('global'); }
  }

  async function activeTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error('Cette page ne permet pas l’injection (page interne du navigateur ou URL non HTTP).');
    return tab;
  }

  async function validateStrategy() {
    const text = message.trim();
    if (!text) { setStatus('Saisissez le message qui servira au test.'); return; }
    const confirmed = window.confirm('Ce test va réellement envoyer le texte saisi dans le chat de l’onglet actif. La stratégie ne sera enregistrée que si un nouveau message correspondant est détecté dans la conversation. Continuer ?');
    if (!confirmed) return;
    try {
      const tab = await activeTab();
      setStatus('Test en cours : l’extension observe la conversation avant d’enregistrer la stratégie…');
      const response = await browser.tabs.sendMessage(tab.id!, { type: 'CHAT_AUTOMATION_VALIDATE', text });
      setStatus(typeof response?.message === 'string' ? response.message : 'Résultat du test indéterminé. Consultez les logs.');
      await refreshStrategyStatus();
      await refreshLogs();
    } catch (error) {
      setStatus(error instanceof Error && error.message.startsWith('Cette page') ? error.message : 'Le script de page est indisponible. Rechargez la page puis réessayez.');
    }
  }

  function updateAutomationMessage(index: number, value: string) {
    setAutomationMessages(current => current.map((item, itemIndex) => itemIndex === index ? value : item));
  }

  function addAutomationMessage() {
    setAutomationMessages(current => [...current, '']);
  }

  function removeAutomationMessage(index: number) {
    setAutomationMessages(current => current.length <= 1 ? [''] : current.filter((_, itemIndex) => itemIndex !== index));
  }

  function moveAutomationMessage(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= automationMessages.length || to >= automationMessages.length) return;
    setAutomationMessages(current => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function startAutomation() {
    const messages = automationMessages.map(text => text.trim());
    const amount = Number(interval);
    if (messages.length === 0 || messages.some(text => !text)) { setStatus('Ajoutez au moins un message et renseignez tous les messages de la séquence.'); return; }
    for (let index = 0; index < messages.length; index++) {
      const unknown = validateTemplateVariables(messages[index]!, variables, 'automation');
      if (unknown.length > 0) { setStatus(`Message ${index + 1} : variable(s) inconnue(s) ${unknown.map(name => `{{${name}}}`).join(', ')}. Créez-les dans la page Variables.`); setPage('variables'); return; }
      const residual = messages[index]!.replace(/{{\s*[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*\s*}}/g, '');
      if (residual.includes('{{') || residual.includes('}}')) { setStatus(`Message ${index + 1} : syntaxe de variable invalide. Utilisez {{nom}}.`); return; }
    }
    if (!Number.isFinite(amount) || amount <= 0) { setStatus('L’intervalle doit être un nombre positif.'); return; }
    if (!/^\d+$/.test(repeatCount.trim()) || !Number.isSafeInteger(Number(repeatCount)) || Number(repeatCount) < 0) { setStatus('Le nombre de cycles doit être un entier positif ou nul (0 = infini).'); return; }
    if (timeWindowEnabled && startTime === endTime) { setStatus('Le créneau est invalide : choisissez deux heures différentes, ou désactivez le créneau horaire.'); return; }
    try {
      const tab = await activeTab();
      await persistSettings();
      const response = await browser.tabs.sendMessage(tab.id!, {
        type: 'CHAT_AUTOMATION_START', messages, variables,
        intervalMs: Math.round(amount * (unit === 'minutes' ? 60_000 : 1_000)),
        repeatMode: Number(repeatCount) === 0 ? 'infinite' : 'finite', repeatCount: Number(repeatCount), timeWindowEnabled, startTime, endTime,
      });
      setStatus(typeof response?.message === 'string' ? response.message : 'Automatisation lancée.');
      await refreshLogs();
    } catch (error) {
      setStatus(error instanceof Error && error.message.startsWith('Cette page') ? error.message : 'Le script de page est indisponible. Rechargez la page puis réessayez.');
    }
  }

  async function stopAutomation() {
    try {
      const tab = await activeTab();
      const response = await browser.tabs.sendMessage(tab.id!, { type: 'CHAT_AUTOMATION_STOP' });
      setStatus(typeof response?.message === 'string' ? response.message : 'Commande d’arrêt transmise.');
      await refreshLogs();
    } catch { setStatus('Impossible de joindre le script de page. Vérifiez que l’onglet est toujours ouvert.'); }
  }

  function countdownLabel(target: number | null | undefined): string {
    if (typeof target !== 'number') return 'En attente';
    const secondsLeft = Math.max(0, Math.ceil((target - clockNow) / 1000));
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    return minutes > 0 ? `${minutes} min ${String(seconds).padStart(2, '0')} s` : `${seconds} s`;
  }

  function phaseLabel(phase: RuntimeStatus['phase']): string {
    switch (phase) {
      case 'ready': return 'Prêt à envoyer';
      case 'waiting-interval': return 'Compte à rebours';
      case 'waiting-window': return 'En attente du créneau';
      case 'waiting-llm': return 'En attente du LLM';
      case 'sending': return 'Envoi en cours';
      case 'finished': return 'Terminé';
      case 'failed': return 'Arrêt sur erreur';
      default: return 'Arrêté';
    }
  }

  async function exportLogs() {
    const data = await browser.storage.local.get('chatAutomationLogs');
    const blob = new Blob([JSON.stringify(data.chatAutomationLogs ?? [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'chat-automation-logs.json'; anchor.click(); URL.revokeObjectURL(url);
  }

  return <main className={`popup-shell ${page === 'automation' ? 'automation-view' : ''} ${page === 'variables' ? 'variables-view' : ''} ${page === 'history' ? 'history-view' : ''} ${page === 'logs' ? 'logs-view' : ''}`}>
    <header className="popup-header"><div className="mark" aria-hidden="true">CA</div><div className="brand-copy"><h1>Chat Automation</h1><p>Détection et automatisation de messages</p></div><button type="button" className="help-button" aria-label="Ouvrir la documentation" title="Documentation" onClick={() => void browser.tabs.create({ url: browser.runtime.getURL('documentation.html') })}>?</button></header>
    <nav className="main-nav" aria-label="Navigation principale">
      <button className={page === 'automation' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('automation')}>Automatisation</button>
      <button className={page === 'variables' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('variables')}>Variables</button>
      <button className={page === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('history')}>Historique</button>
      <button className={page === 'logs' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('logs')}>Logs</button>
    </nav>

    <div className="popup-content">
    {page === 'automation' ? strategyReady === null ? <>
      <div className="page-heading"><h2>Automatisation</h2><p>Vérification de la stratégie enregistrée pour l’onglet actif…</p></div>
      <p className="empty">Chargement de la configuration du site.</p>
    </> : strategyReady === false ? <>
      <div className="page-heading"><h2>Configurer la stratégie d’envoi</h2><p>Aucune stratégie validée n’est enregistrée pour {strategyOrigin || 'l’onglet actif'}. Effectuez un test pour apprendre comment envoyer un message sur ce site. Une fois la stratégie validée, cette page affichera automatiquement les paramètres d’automatisation.</p></div>
      <label htmlFor="message">Message de test</label>
      <TemplateTextarea id="message" value={message} onChange={setMessage} variables={variables} placeholder="Écrivez un message de test…" rows={4} />
      <p className="helper autocomplete-note">Tapez <code>{`{{`}</code> pour afficher les variables disponibles.</p>
      <button className="secondary validate-button" onClick={() => void validateStrategy()}>Tester l’envoi et enregistrer la stratégie</button>
      <p className="notice">Ce test envoie réellement le texte saisi dans le chat actif. La stratégie ne sera enregistrée que si l’extension confirme qu’un nouveau message correspondant apparaît dans la conversation.</p>
      <p className="status" role="status">{status}</p>
    </> : <>
      <div className="page-heading"><h2>Automatiser l’envoi</h2><p>Stratégie validée pour {strategyOrigin}. La séquence sera envoyée sur l’onglet actif, selon la fréquence et les options horaires choisies.</p></div>
      <div className="sequence-heading"><div><h3>Séquence de messages</h3><p className="helper">Les messages sont envoyés dans l’ordre affiché, puis la séquence recommence au premier message.</p></div><button className="secondary add-message" onClick={addAutomationMessage}>+ Ajouter</button></div>
      <div className="message-sequence" aria-label="Séquence de messages">
        {automationMessages.map((text, index) => <div
          className={draggingIndex === index ? 'sequence-item dragging' : 'sequence-item'}
          key={`sequence-${index}`}
          draggable
          onDragStart={event => { setDraggingIndex(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
          onDrop={event => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) moveAutomationMessage(from, index); setDraggingIndex(null); }}
          onDragEnd={() => setDraggingIndex(null)}
        >
          <button type="button" className="drag-handle" aria-label={`Déplacer le message ${index + 1}`} title="Glisser pour réordonner">⠿</button>
          <span className="sequence-number">{index + 1}</span>
          <TemplateTextarea ariaLabel={`Message ${index + 1}`} className="sequence-template-input" value={text} onChange={next => updateAutomationMessage(index, next)} variables={variables} placeholder={`Texte du message ${index + 1}…`} rows={2} />
          <button type="button" className="remove-message" aria-label={`Supprimer le message ${index + 1}`} title="Supprimer ce message" onClick={() => removeAutomationMessage(index)}>×</button>
        </div>)}
      </div>
      <section className="settings-section">
        <h3>Paramètres des cycles</h3>
        <div className="cycle-grid">
          <div className="cycle-field"><label htmlFor="interval">Fréquence</label><input id="interval" type="number" min="1" step="1" value={interval} onChange={e => setIntervalValue(e.target.value)} /></div>
          <div className="cycle-field"><label htmlFor="unit">Unité</label><select id="unit" value={unit} onChange={e => setUnit(e.target.value as 'seconds' | 'minutes')}><option value="seconds">Secondes</option><option value="minutes">Minutes</option></select></div>
          <div className="cycle-field"><label htmlFor="repeat-count">Nombre de cycles</label><input id="repeat-count" type="text" inputMode="numeric" pattern="[0-9]*" value={repeatCount} onChange={e => setRepeatCount(e.target.value)} aria-describedby="repeat-count-help" /></div>
        </div>
        <p id="repeat-count-help" className="helper cycle-help">0 = infini. Une valeur positive définit le nombre de répétitions de la séquence entière.</p>
        <h3>Créneau horaire quotidien</h3>
        <label className="toggle-row" htmlFor="time-window-enabled"><input id="time-window-enabled" type="checkbox" checked={timeWindowEnabled} onChange={e => setTimeWindowEnabled(e.target.checked)} /><span>Limiter les envois à un créneau horaire</span></label>
        {timeWindowEnabled ? <>
          <p className="helper">Les envois sont suspendus en dehors de ce créneau, puis reprennent à l’ouverture suivante.</p>
          <div className="field-row time-row">
            <div><label htmlFor="start-time">Début</label><input id="start-time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
            <span className="time-separator">à</span>
            <div><label htmlFor="end-time">Fin</label><input id="end-time" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
          </div>
          <p className="helper">Si l’heure de début est après l’heure de fin, le créneau passe minuit. Une même heure de début et de fin n’est pas autorisée.</p>
        </> : <p className="helper">Aucune restriction horaire : les envois peuvent avoir lieu à toute heure.</p>}
      </section>
      <p className="notice">Utilisez {'{{nom}}'} pour insérer une variable définie dans la page Variables. Les variables sont résolues juste avant chaque envoi. L’onglet doit rester ouvert ; un rechargement interrompt le cycle.</p>
    </> : page === 'variables' ? <>
      <div className="page-heading"><h2>Variables</h2><p>Créez des valeurs réutilisables dans les modèles de messages. La V4 active actuellement les variables statiques ; le moteur est préparé pour ajouter d’autres fournisseurs ultérieurement.</p></div>
      <section className="variable-form">
        <h3>{editingVariableId ? 'Modifier une variable' : 'Nouvelle variable'}</h3>
        <label htmlFor="variable-name">Nom</label>
        <input id="variable-name" value={variableName} onChange={event => setVariableName(event.target.value)} placeholder="prenom" autoComplete="off" />
        <p className="helper">Utilisation dans un message : <code>{`{{${variableName.trim() || 'prenom'}}}`}</code></p>
        <label htmlFor="variable-value">Valeur statique</label>
        <textarea id="variable-value" value={variableValue} onChange={event => setVariableValue(event.target.value)} placeholder="Alexandre" rows={2} />
        <label htmlFor="variable-scope">Portée</label>
        <select id="variable-scope" value={variableScope} onChange={event => setVariableScope(event.target.value as VariableScope)}><option value="global">Globale — disponible partout</option><option value="automation">Automatisation — disponible dans les séquences</option></select>
        {variableError ? <p className="variable-error" role="alert">{variableError}</p> : null}
        <div className="variable-form-actions"><button className="primary" onClick={() => void saveVariable()}>{editingVariableId ? 'Enregistrer les modifications' : 'Ajouter la variable'}</button>{editingVariableId ? <button className="secondary" onClick={() => { setEditingVariableId(null); setVariableName(''); setVariableValue(''); setVariableScope('global'); setVariableError(''); }}>Annuler</button> : null}</div>
      </section>
      <section className="variable-list-section">
        <div className="section-head"><h2>Variables enregistrées ({variables.length})</h2></div>
        {variables.length === 0 ? <p className="empty">Aucune variable. Ajoutez-en une ci-dessus pour l’utiliser dans vos messages.</p> : <div className="variable-list">{variables.map(item => <article className="variable-card" key={item.id}><div className="variable-card-head"><code>{`{{${item.name}}}`}</code><span>{item.scope === 'global' ? 'Globale' : 'Automatisation'}</span></div><p>{item.value}</p><div className="variable-card-actions"><button className="secondary" onClick={() => editVariable(item)}>Modifier</button><button className="secondary danger-action" onClick={() => void deleteVariable(item)}>Supprimer</button></div></article>)}</div>}
      </section>
      <section className="variable-preview"><h3>Aperçu de résolution</h3><p className="helper">Les variables reconnues dans un modèle seront remplacées juste avant l’envoi.</p><label htmlFor="variable-preview-input">Modèle de test</label><TemplateTextarea id="variable-preview-input" value={variablePreviewText} onChange={setVariablePreviewText} variables={variables} placeholder="Bonjour {{prenom}}" rows={2} />
        {(() => { const unknown = validateTemplateVariables(variablePreviewText, variables, 'automation'); const preview = variablePreviewText.replace(/{{\s*([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*)\s*}}/g, (_match, name: string) => { if (name.includes('.') || name.includes('[')) return `[résolu à l’exécution : ${name}]`; const scoped = variables.find(item => item.name === name && item.scope === 'automation'); const global = variables.find(item => item.name === name && item.scope === 'global'); return scoped?.value ?? global?.value ?? `{{${name}}}`; }); return <div className="preview-result"><strong>Résultat</strong><p>{preview || 'Saisissez un modèle pour afficher l’aperçu.'}</p>{unknown.length > 0 ? <small>Variables manquantes : {unknown.map(name => `{{${name}}}`).join(', ')}</small> : null}</div>; })()}
      </section>
    </> : page === 'history' ? <>
      <div className="page-heading"><h2>Historique de la conversation</h2><p>Capture locale des messages visibles dans l’onglet actif. Les réponses sont mises à jour pendant leur génération puis finalisées lorsque le texte se stabilise.</p></div>
      <div className="history-toolbar"><span className="history-origin">{historyConversationId || 'Aucune conversation sélectionnée'}</span><button className="secondary" onClick={() => void refreshHistory()}>Actualiser</button></div>
      {historyError ? <p className="notice">{historyError}</p> : historyMessages.length === 0 ? <p className="empty history-empty">Aucun message capturé pour ce site. Ouvrez une conversation et gardez l’onglet ouvert pendant que l’extension l’observe.</p> : <div className="history-list">{historyMessages.map(item => <article className={`history-message role-${item.role} status-${item.status}`} key={item.id}>
        <div className="history-message-head"><strong>{item.role === 'user' ? 'Vous' : item.role === 'assistant' ? 'Assistant' : item.role === 'system' ? 'Système' : 'Auteur inconnu'}</strong><span>{new Date(item.firstSeenAt).toLocaleString()}</span><em>{item.status === 'streaming' ? 'En cours' : item.status === 'incomplete' ? 'Interrompu / incomplet' : 'Terminé'}</em></div>
        <p>{item.content}</p>{item.contentTruncated ? <small className="history-truncated">Contenu tronqué à 20 000 caractères.</small> : null}
      </article>)}</div>}
      <p className="notice">L’historique est conservé localement par site (jusqu’aux 2 000 derniers messages) et cette vue affiche la conversation de l’onglet actif. Seuls les messages que l’interface expose dans le DOM peuvent être capturés ; les pièces jointes, images, éléments masqués et conversations non chargées peuvent être absents.</p>
    </> : null}

    {page === 'logs' ? <>
      <div className="page-heading"><h2>Journal des événements</h2><p>Les événements de détection et d’automatisation sont regroupés ici. La liste s’actualise automatiquement.</p></div>
      <section className="logs-section logs-page-section">
        <div className="section-head"><h2>Événements récents</h2><button className="secondary" onClick={() => void refreshLogs()}>Actualiser</button></div>
        <div className="logs">{logs.length === 0 ? <p className="empty">Aucun événement enregistré.</p> : logs.map((log, index) => <article key={`${log.timestamp}-${index}`}><strong>{log.level}</strong><span>{new Date(log.timestamp).toLocaleString()} · {log.site}</span><p>{log.event}{log.details ? ` — ${log.details}` : ''}</p></article>)}</div>
      </section>
      <p className="notice">Les logs de confirmation peuvent contenir un aperçu du message attendu. La validation observe un nouveau message dans le DOM ; elle ne constitue pas une preuve de réception par le serveur.</p>
    </> : null}
    </div>
    {page === 'history' ? <div className="history-dock">
      <button className="secondary export-history-button" disabled={historyMessages.length === 0} onClick={() => void exportHistory()}>Exporter l’historique JSON</button>
    </div> : null}
    {page === 'logs' ? <div className="logs-dock">
      <button className="secondary export-logs-button" onClick={() => void exportLogs()}>Exporter les logs JSON</button>
    </div> : null}
    {page === 'automation' && strategyReady === true ? <div className="automation-dock">
      <div className="automation-actions">
        <button className="primary" onClick={() => void startAutomation()}>Démarrer l’automatisation</button>
        <button className="stop-button" onClick={() => void stopAutomation()}>Arrêter l’automatisation</button>
      </div>
      <p className="status" role="status">{status}</p>
      <section className="runtime-panel" aria-live="polite" aria-label="État de l’automatisation">
        <div className="runtime-head"><h3>Suivi de l’automatisation</h3><span className={`runtime-badge phase-${runtimeStatus?.phase ?? 'stopped'}`}>{phaseLabel(runtimeStatus?.phase ?? 'stopped')}</span></div>
        <p className="runtime-note">{runtimeStatus?.note ?? 'Aucune exécution enregistrée. Démarrez une automatisation pour afficher sa progression.'}</p>
        <div className="runtime-metrics">
          <div><span>Itération</span><strong>{runtimeStatus?.phase === 'finished' ? (runtimeStatus.completedSequences || 0) : runtimeStatus && runtimeStatus.phase !== 'stopped' && runtimeStatus.phase !== 'failed' ? runtimeStatus.completedSequences + 1 : runtimeStatus?.completedSequences ?? 0}<small>{runtimeStatus?.repeatMode === 'infinite' ? ' / ∞' : runtimeStatus ? ` / ${runtimeStatus.repeatCount}` : ''}</small></strong></div>
          <div><span>Message</span><strong>{runtimeStatus?.messagesCount ? `${Math.min(runtimeStatus.messageIndex + 1, runtimeStatus.messagesCount)} / ${runtimeStatus.messagesCount}` : '—'}</strong></div>
          <div><span>Prochain envoi</span><strong>{runtimeStatus?.phase === 'waiting-llm' ? 'En attente du LLM' : runtimeStatus?.phase === 'sending' ? 'En cours…' : runtimeStatus?.phase === 'finished' || runtimeStatus?.phase === 'stopped' || runtimeStatus?.phase === 'failed' ? '—' : countdownLabel(runtimeStatus?.nextSendAt)}</strong></div>
        </div>
      </section>
    </div> : page !== 'automation' ? <p className="status detection-status" role="status">{status}</p> : null}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Popup />);
