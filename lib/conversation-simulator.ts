import { resolveMessageTemplate, type VariableDefinition } from './variables';

export interface ConversationPair {
  id: number;
  sent: string;
  expected: string;
}

export interface ConversationPairResult extends ConversationPair {
  renderedSent: string;
  status: 'ok' | 'error';
  error?: string;
}

export interface ConversationSimulationResult {
  pairs: ConversationPairResult[];
  successful: number;
  failed: number;
}

/** Simulates a deterministic conversation using the user's expected replies; never sends messages or calls an LLM. */
export async function simulateConversation(
  pairs: ConversationPair[],
  variables: VariableDefinition[],
): Promise<ConversationSimulationResult> {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new Error('Ajoutez au moins une paire de messages.');
  }
  const invalidIndex = pairs.findIndex(pair =>
    !pair || typeof pair.sent !== 'string' || !pair.sent.trim() ||
    typeof pair.expected !== 'string' || !pair.expected.trim());
  if (invalidIndex >= 0) {
    throw new Error(`Complétez les deux messages de la paire ${invalidIndex + 1}.`);
  }

  const results: ConversationPairResult[] = [];
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index]!;
    try {
      const rendered = await resolveMessageTemplate(pair.sent, variables, {
        iteration: 1,
        messageIndex: index + 1,
        timestamp: new Date(),
      }, 'automation', {
        automation: {
          sequence: { iteration: 1, total_iterations: 1 },
          message: { index: index + 1, total: pairs.length },
          messages: pairs.map(item => ({ content: item.sent })),
        },
      });
      results.push({ ...pair, renderedSent: rendered.text, status: 'ok' });
    } catch (cause) {
      results.push({
        ...pair,
        renderedSent: '',
        status: 'error',
        error: cause instanceof Error ? cause.message : 'Échec du rendu du modèle.',
      });
    }
  }
  return {
    pairs: results,
    successful: results.filter(pair => pair.status === 'ok').length,
    failed: results.filter(pair => pair.status === 'error').length,
  };
}
