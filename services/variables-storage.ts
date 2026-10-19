import {
  filterValidVariableDefinitions,
  VARIABLES_STORAGE_KEY,
  type VariableDefinition,
} from '../lib/variables';

export type StorageReader = (key: string) => Promise<Record<string, unknown>>;
export type StorageWriter = (items: Record<string, unknown>) => Promise<void>;

/** Read and validate stored variable definitions at the storage boundary. */
export async function loadStoredVariables(read: StorageReader): Promise<VariableDefinition[]> {
  const stored = await read(VARIABLES_STORAGE_KEY);
  return filterValidVariableDefinitions(stored[VARIABLES_STORAGE_KEY]);
}

/** Persist only validated variable definitions and return the canonical saved list. */
export async function saveStoredVariables(
  write: StorageWriter,
  variables: VariableDefinition[],
): Promise<VariableDefinition[]> {
  const safeVariables = filterValidVariableDefinitions(variables);
  await write({ [VARIABLES_STORAGE_KEY]: safeVariables });
  return safeVariables;
}
