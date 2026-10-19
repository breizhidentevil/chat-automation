import { isValidDiagnosticEvent } from '../lib/diagnostic-validation';
import type { DiagnosticEvent } from '../lib/contracts';
import type { StorageReader } from './variables-storage';

export const LOGS_STORAGE_KEY = 'chatAutomationLogs';

/** Read only valid, most recent diagnostic events in the order expected by the UI. */
export async function loadRecentLogs(read: StorageReader, limit = 30): Promise<DiagnosticEvent[]> {
  const stored = await read(LOGS_STORAGE_KEY);
  const events = Array.isArray(stored[LOGS_STORAGE_KEY]) ? stored[LOGS_STORAGE_KEY].filter(isValidDiagnosticEvent) as DiagnosticEvent[] : [];
  return events.slice(-limit).reverse();
}
