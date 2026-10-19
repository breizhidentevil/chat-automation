import {
  sanitizeSavedAutomationSettings,
  type SavedAutomationSettings,
} from '../lib/automation-validation';
import type { StorageReader, StorageWriter } from './variables-storage';

export const AUTOMATION_SETTINGS_STORAGE_KEY = 'chatAutomationSettings';

/** Read and normalize persisted automation settings at the storage boundary. */
export async function loadAutomationSettings(read: StorageReader): Promise<SavedAutomationSettings | null> {
  const stored = await read(AUTOMATION_SETTINGS_STORAGE_KEY);
  return sanitizeSavedAutomationSettings(stored[AUTOMATION_SETTINGS_STORAGE_KEY]);
}

/** Persist the editable settings without coupling storage to React state. */
export async function saveAutomationSettings(
  write: StorageWriter,
  settings: Omit<SavedAutomationSettings, 'repeatMode'> & { repeatMode?: SavedAutomationSettings['repeatMode'] },
): Promise<void> {
  await write({ [AUTOMATION_SETTINGS_STORAGE_KEY]: settings });
}
