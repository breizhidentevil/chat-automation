import { useState } from 'react';
import { simulateAutomation, type SimulationResult } from '../../../lib/simulator';
import type { VariableDefinition } from '../../../lib/variables';
import type { Locale } from '../../../lib/i18n';
import { translate } from '../../../lib/i18n';

type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;

interface UseSimulationOptions {
  automationMessages: string[];
  variables: VariableDefinition[];
  interval: string;
  unit: 'seconds' | 'minutes';
  timeWindowEnabled: boolean;
  startTime: string;
  endTime: string;
  t: Translate;
}

function toLocalDateTimeInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function useSimulation({
  automationMessages, variables, interval, unit, timeWindowEnabled, startTime, endTime, t,
}: UseSimulationOptions) {
  const [simulationContext, setSimulationContext] = useState(`{
  "chat": { "session": { "title": "Conversation de test", "url": "https://example.test/chat" } },
  "data": { "ticket": "A-123", "items": [{ "name": "Exemple", "value": "123" }] }
}`);
  const [simulationStartAt, setSimulationStartAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [simulationCycles, setSimulationCycles] = useState('2');
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulationError, setSimulationError] = useState('');

  async function runSimulation() {
    setSimulationError('');
    setSimulationResult(null);
    const messages = automationMessages.map(item => item.trim());
    if (!messages.length || messages.some(item => !item)) {
      setSimulationError(t('sequenceEmpty'));
      return;
    }
    let dynamicData: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(simulationContext);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(t('simulationContextInvalid'));
      dynamicData = parsed as Record<string, unknown>;
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : t('simulationContextInvalid'));
      return;
    }
    const cycleCount = Number(simulationCycles);
    const intervalAmount = Number(interval);
    const startAt = new Date(simulationStartAt);
    if (!Number.isSafeInteger(cycleCount) || cycleCount < 1 || cycleCount > 10) {
      setSimulationError(t('simulationCycleLimit'));
      return;
    }
    if (!Number.isFinite(intervalAmount) || intervalAmount <= 0 || !Number.isFinite(startAt.getTime())) {
      setSimulationError(t('simulationInvalidSettings'));
      return;
    }
    try {
      const result = await simulateAutomation({
        messages,
        variables,
        intervalMs: Math.round(intervalAmount * (unit === 'minutes' ? 60_000 : 1_000)),
        repeatCount: cycleCount,
        startAt,
        timeWindowEnabled,
        startTime,
        endTime,
        dynamicData,
      });
      setSimulationResult(result);
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : t('simulationFailedGeneric'));
    }
  }

  return {
    simulationContext, setSimulationContext, simulationStartAt, setSimulationStartAt,
    simulationCycles, setSimulationCycles, simulationResult, simulationError, runSimulation,
  };
}
