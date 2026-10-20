import type { DiagnosticEvent } from './contracts';

const MAX_SITE_LENGTH = 2048;
const MAX_EVENT_LENGTH = 256;
const MAX_DETAILS_LENGTH = 10_000;
const MAX_STRATEGY_LENGTH = 128;

export function isValidDiagnosticEvent(value: unknown): value is DiagnosticEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Partial<DiagnosticEvent>;
  if (typeof event.timestamp !== 'number' || !Number.isFinite(event.timestamp) || event.timestamp < 0) return false;
  if (!['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(event.level as string)) return false;
  if (typeof event.site !== 'string' || event.site.trim().length === 0 || event.site.length > MAX_SITE_LENGTH) return false;
  if (typeof event.event !== 'string' || event.event.trim().length === 0 || event.event.length > MAX_EVENT_LENGTH) return false;
  if (event.details !== undefined && (typeof event.details !== 'string' || event.details.length > MAX_DETAILS_LENGTH)) return false;
  if (event.strategy !== undefined && (typeof event.strategy !== 'string' || event.strategy.length > MAX_STRATEGY_LENGTH)) return false;
  if (event.durationMs !== undefined && (typeof event.durationMs !== 'number' || !Number.isFinite(event.durationMs) || event.durationMs < 0)) return false;
  return true;
}


export const MAX_DIAGNOSTIC_LOGS = 500;
export const MAX_TOTAL_DIAGNOSTIC_CHARACTERS = 1_000_000;

/** Keep the newest valid events within both count and approximate text budgets. */
export function limitDiagnosticEvents(value: unknown): DiagnosticEvent[] {
  if (!Array.isArray(value)) return [];
  const valid = value.filter(isValidDiagnosticEvent).slice(-MAX_DIAGNOSTIC_LOGS);
  const result: DiagnosticEvent[] = [];
  let totalCharacters = 0;
  for (let index = valid.length - 1; index >= 0; index -= 1) {
    const event = valid[index]!;
    const size = event.site.length + event.event.length +
      (event.details?.length ?? 0) + (event.strategy?.length ?? 0) + 128;
    if (result.length > 0 && totalCharacters + size > MAX_TOTAL_DIAGNOSTIC_CHARACTERS) break;
    result.push(event);
    totalCharacters += size;
  }
  return result.reverse();
}
