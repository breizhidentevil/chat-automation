import type { DiagnosticEvent, LogLevel } from './contracts';

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
    // The background worker serializes writes so concurrent tabs do not overwrite
    // one another's read-modify-write operations in storage.local.
    const response = await browser.runtime.sendMessage({
      type: 'CHAT_AUTOMATION_LOG_EVENT',
      entry,
    });
    if (!response?.ok) throw new Error('Background logger rejected the event');
  } catch {
    console.warn('[Chat Automation] Échec de persistance du journal', entry.level, entry.event);
  }
}
