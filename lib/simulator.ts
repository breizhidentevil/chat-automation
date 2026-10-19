import { resolveMessageTemplate, type VariableDefinition } from './variables';

export interface SimulationConfig {
  messages: string[];
  variables: VariableDefinition[];
  intervalMs: number;
  repeatCount: number;
  startAt: Date;
  timeWindowEnabled: boolean;
  startTime: string;
  endTime: string;
  dynamicData: Record<string, unknown>;
}

export interface SimulationEntry {
  cycle: number;
  messageIndex: number;
  template: string;
  scheduledAt: string;
  renderedText?: string;
  error?: string;
  variablesUsed?: string[];
}

export interface SimulationResult {
  entries: SimulationEntry[];
  successful: number;
  failed: number;
  startedAt: string;
  finishedAt: string;
  simulatedDurationMs: number;
}

export const MAX_SIMULATION_CYCLES = 10;
export const MAX_SIMULATION_MESSAGES = 100;
export const MAX_SIMULATION_ENTRIES = MAX_SIMULATION_CYCLES * MAX_SIMULATION_MESSAGES;

function parseClock(value: string): number {
  const match = /^(\\d{2}):(\\d{2})$/.exec(value);
  if (!match) throw new Error('Les heures doivent respecter le format HH:MM.');
  return Number(match[1]) * 60 + Number(match[2]);
}

function startOfLocalDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Move a planned send to the next allowed point in the configured local-time window. */
export function nextSimulationTime(date: Date, enabled: boolean, startTime: string, endTime: string): Date {
  const candidate = new Date(date);
  if (!Number.isFinite(candidate.getTime())) throw new Error('Date de simulation invalide.');
  if (!enabled) return candidate;

  const start = parseClock(startTime);
  const end = parseClock(endTime);
  if (start === end) throw new Error('Les heures de début et de fin doivent être différentes.');
  const minute = candidate.getHours() * 60 + candidate.getMinutes();
  const inside = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (inside) return candidate;

  const allowed = startOfLocalDay(candidate);
  allowed.setMinutes(start);
  if (start < end && minute >= end) allowed.setDate(allowed.getDate() + 1);
  if (start > end && minute >= end && minute < start) {
    // For an overnight window, times between end and start wait for today's start.
  }
  return allowed;
}

/**
 * Simulate rendered messages and scheduled timestamps only. This module deliberately has
 * no browser, storage, network, DOM, or send-message dependencies.
 */
export async function simulateAutomation(config: SimulationConfig): Promise<SimulationResult> {
  if (!Array.isArray(config.messages) || config.messages.length === 0 || config.messages.length > MAX_SIMULATION_MESSAGES ||
      config.messages.some(message => typeof message !== 'string' || !message.trim())) {
    throw new Error(`La séquence doit contenir entre 1 et ${MAX_SIMULATION_MESSAGES} messages non vides.`);
  }
  if (!Number.isSafeInteger(config.intervalMs) || config.intervalMs < 1_000 || config.intervalMs > 31 * 24 * 60 * 60 * 1_000) {
    throw new Error('L’intervalle doit être compris entre 1 seconde et 31 jours.');
  }
  if (!Number.isSafeInteger(config.repeatCount) || config.repeatCount < 1 || config.repeatCount > MAX_SIMULATION_CYCLES) {
    throw new Error(`Le simulateur accepte de 1 à ${MAX_SIMULATION_CYCLES} cycles pour éviter les simulations trop volumineuses.`);
  }
  if (!(config.startAt instanceof Date) || !Number.isFinite(config.startAt.getTime())) {
    throw new Error('Date de début de simulation invalide.');
  }
  if (!config.dynamicData || typeof config.dynamicData !== 'object' || Array.isArray(config.dynamicData)) {
    throw new Error('Le contexte dynamique doit être un objet JSON.');
  }
  // Validate the time range before generating any entries.
  if (config.timeWindowEnabled) {
    const start = parseClock(config.startTime), end = parseClock(config.endTime);
    if (start === end) throw new Error('Les heures de début et de fin doivent être différentes.');
  }

  const startedAt = new Date(config.startAt);
  let cursor = new Date(startedAt);
  const entries: SimulationEntry[] = [];

  for (let cycle = 1; cycle <= config.repeatCount; cycle += 1) {
    for (let index = 0; index < config.messages.length; index += 1) {
      const scheduled = nextSimulationTime(cursor, config.timeWindowEnabled, config.startTime, config.endTime);
      const template = config.messages[index]!;
      const dynamicData: Record<string, unknown> = {
        ...config.dynamicData,
        automation: {
          ...(config.dynamicData.automation && typeof config.dynamicData.automation === 'object' && !Array.isArray(config.dynamicData.automation)
            ? config.dynamicData.automation as Record<string, unknown>
            : {}),
          sequence: {
            ...((config.dynamicData.automation && typeof config.dynamicData.automation === 'object' &&
              (config.dynamicData.automation as Record<string, unknown>).sequence &&
              typeof (config.dynamicData.automation as Record<string, unknown>).sequence === 'object')
              ? (config.dynamicData.automation as Record<string, unknown>).sequence as Record<string, unknown>
              : {}),
            iteration: cycle,
            total_iterations: config.repeatCount,
          },
          message: {
            ...((config.dynamicData.automation && typeof config.dynamicData.automation === 'object' &&
              (config.dynamicData.automation as Record<string, unknown>).message &&
              typeof (config.dynamicData.automation as Record<string, unknown>).message === 'object')
              ? (config.dynamicData.automation as Record<string, unknown>).message as Record<string, unknown>
              : {}),
            index: index + 1,
            total: config.messages.length,
          },
          config: {
            interval: config.intervalMs,
          },
          messages: config.messages.map(content => ({ content })),
        },
      };

      try {
        const rendered = await resolveMessageTemplate(
          template,
          config.variables,
          { iteration: cycle, messageIndex: index + 1, timestamp: scheduled },
          'automation',
          dynamicData,
        );
        entries.push({
          cycle,
          messageIndex: index + 1,
          template,
          scheduledAt: scheduled.toISOString(),
          renderedText: rendered.text,
          variablesUsed: rendered.variablesUsed,
        });
      } catch (error) {
        entries.push({
          cycle,
          messageIndex: index + 1,
          template,
          scheduledAt: scheduled.toISOString(),
          error: error instanceof Error ? error.message : 'Échec du rendu du modèle.',
        });
      }
      cursor = new Date(scheduled.getTime() + config.intervalMs);
    }
  }

  const finishedAt = entries.length ? new Date(entries[entries.length - 1]!.scheduledAt) : new Date(startedAt);
  return {
    entries,
    successful: entries.filter(entry => typeof entry.renderedText === 'string').length,
    failed: entries.filter(entry => typeof entry.error === 'string').length,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    simulatedDurationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
  };
}
