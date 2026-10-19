import React, { useState } from 'react';
import { Alert, Button, Card, Textarea } from '@mantine/core';
import { resolveMessageTemplate, type VariableDefinition } from '../../../lib/variables';
import type { Locale } from '../../../lib/i18n';
import { translate } from '../../../lib/i18n';

type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;
interface Pair { id: number; sent: string; expected: string }
interface ResultPair extends Pair { renderedSent: string; status: 'ok' | 'error'; error?: string }

interface SimulatorPageProps { t: Translate; locale: Locale; variables: VariableDefinition[] }

export default function SimulatorPage({ t, locale, variables }: SimulatorPageProps) {
  const fr = locale === 'fr';
  const [pairs, setPairs] = useState<Pair[]>([{ id: 1, sent: '', expected: '' }]);
  const [results, setResults] = useState<ResultPair[] | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  function updatePair(id: number, field: 'sent' | 'expected', value: string) {
    setPairs(current => current.map(pair => pair.id === id ? { ...pair, [field]: value } : pair));
    setResults(null);
    setError('');
  }
  function addPair() {
    setPairs(current => [...current, { id: Math.max(0, ...current.map(pair => pair.id)) + 1, sent: '', expected: '' }]);
    setResults(null);
  }
  function removePair(id: number) {
    setPairs(current => current.filter(pair => pair.id !== id));
    setResults(null);
    setError('');
  }
  async function runSimulation() {
    setError('');
    setResults(null);
    const emptyIndex = pairs.findIndex(pair => !pair.sent.trim() || !pair.expected.trim());
    if (pairs.length === 0 || emptyIndex >= 0) {
      setError(fr ? (pairs.length === 0 ? 'Ajoutez au moins une paire de messages.' : `Complétez les deux messages de la paire ${emptyIndex + 1}.`) : (pairs.length === 0 ? 'Add at least one message pair.' : `Complete both messages in pair ${emptyIndex + 1}.`));
      return;
    }
    setRunning(true);
    try {
      const next: ResultPair[] = [];
      for (let index = 0; index < pairs.length; index += 1) {
        const pair = pairs[index]!;
        try {
          const rendered = await resolveMessageTemplate(pair.sent, variables, {
            iteration: 1, messageIndex: index + 1, timestamp: new Date(),
          }, 'automation', {
            automation: {
              sequence: { iteration: 1, total_iterations: 1 },
              message: { index: index + 1, total: pairs.length },
              messages: pairs.map(item => ({ content: item.sent })),
            },
          });
          next.push({ ...pair, renderedSent: rendered.text, status: 'ok' });
        } catch (cause) {
          next.push({ ...pair, renderedSent: '', status: 'error', error: cause instanceof Error ? cause.message : String(cause) });
        }
      }
      setResults(next);
    } finally {
      setRunning(false);
    }
  }

  return <>
    <div className="page-heading"><h2>{t('simulator')}</h2></div>
    <p className="simulator-safety-note">{fr
      ? 'Simulation locale et déterministe : aucun message réel n’est envoyé et aucun LLM n’est contacté. Les messages reçus sont les réponses attendues que vous définissez.'
      : 'Local, deterministic simulation: no real messages are sent and no LLM is contacted. Received messages are the expected replies you define.'}</p>
    <div className="conversation-pairs">
      {pairs.map((pair, index) => <Card key={pair.id} className="conversation-pair" padding="sm" withBorder>
        <div className="sequence-heading">
          <h3>{fr ? `Paire ${index + 1}` : `Pair ${index + 1}`}</h3>
          <Button variant="subtle" color="red" size="compact-sm" onClick={() => removePair(pair.id)} aria-label={fr ? `Supprimer la paire ${index + 1}` : `Remove pair ${index + 1}`}>×</Button>
        </div>
        <Textarea label={fr ? 'Message envoyé' : 'Sent message'} value={pair.sent} onChange={event => updatePair(pair.id, 'sent', event.currentTarget.value)} autosize minRows={2} maxRows={8} placeholder={fr ? 'Contenu envoyé au LLM…' : 'Content sent to the LLM…'} />
        <Textarea mt="sm" label={fr ? 'Message reçu attendu' : 'Expected received message'} value={pair.expected} onChange={event => updatePair(pair.id, 'expected', event.currentTarget.value)} autosize minRows={2} maxRows={8} placeholder={fr ? 'Réponse attendue du LLM…' : 'Expected LLM reply…'} />
      </Card>)}
    </div>
    <Button variant="default" fullWidth mt="sm" onClick={addPair}>{fr ? '+ Ajouter une paire de messages' : '+ Add message pair'}</Button>
    <Button className="primary" loading={running} onClick={() => void runSimulation()}>{fr ? 'Lancer la simulation' : 'Run simulation'}</Button>
    {error ? <Alert mt="sm" color="red" role="alert">{error}</Alert> : null}
    {results ? <section className="conversation-results" aria-live="polite">
      <h3>{fr ? 'Conversation simulée' : 'Simulated conversation'}</h3>
      <p className="helper">{fr ? 'Les réponses reçues sont injectées depuis le scénario ; elles ne proviennent pas d’un LLM réel.' : 'Received replies are injected from the scenario; they do not come from a real LLM.'}</p>
      {results.map((result, index) => <Card key={result.id} padding="sm" withBorder className={result.status === 'error' ? 'simulation-entry failed' : 'conversation-result-pair'}>
        <strong>{fr ? `Paire ${index + 1}` : `Pair ${index + 1}`} — {result.status === 'ok' ? (fr ? 'Modèle rendu' : 'Template rendered') : (fr ? 'Erreur de rendu' : 'Render error')}</strong>
        <p><span>{fr ? 'Envoyé' : 'Sent'}</span><code>{result.status === 'error' ? result.error : result.renderedSent}</code></p>
        {result.status === 'ok' ? <p><span>{fr ? 'Reçu (simulé)' : 'Received (simulated)'}</span><code>{result.expected}</code></p> : null}
      </Card>)}
      <p className="helper">{fr ? `${results.filter(result => result.status === 'ok').length} paire(s) rendue(s), ${results.filter(result => result.status === 'error').length} erreur(s).` : `${results.filter(result => result.status === 'ok').length} pair(s) rendered, ${results.filter(result => result.status === 'error').length} error(s).`}</p>
    </section> : null}
  </>;
}
