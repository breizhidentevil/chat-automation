import type { DiagnosticEvent, LogLevel } from './contracts';

const LOG_KEY = 'chatAutomationLogs';
const MAX_LOGS = 500;

export async function logEvent(
  site: string,
  level: LogLevel,
  event: string,
  details?: string,
  extra: Pick<DiagnosticEvent, 'strategy' | 'durationMs'> = {},
): Promise<void> {
  const entry: DiagnosticEvent = {
    timestamp: Date.now(), level, site, event,
    ...(details === undefined ? {} : { details }),
    ...extra,
  };
  try {
    const stored = await browser.storage.local.get(LOG_KEY);
    const previous = (stored[LOG_KEY] as DiagnosticEvent[] | undefined) ?? [];
    await browser.storage.local.set({ [LOG_KEY]: [...previous, entry].slice(-MAX_LOGS) });
  } catch {
    console.warn('[Chat Automation] Échec de persistance du journal', entry.level, entry.event);
  }
}
