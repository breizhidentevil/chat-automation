import type { ChatSiteProcedure } from './contracts';
import { isValidChatSiteProcedure } from './procedure-validation';

const PROCEDURES_KEY = 'chatAutomationProcedures';

function readValidProcedures(value: unknown): Record<string, ChatSiteProcedure> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const valid: Record<string, ChatSiteProcedure> = Object.create(null);
  for (const [key, candidate] of Object.entries(value)) {
    if (isValidChatSiteProcedure(candidate, key)) valid[key] = candidate;
  }
  return valid;
}

export async function getProcedure(origin: string): Promise<ChatSiteProcedure | undefined> {
  const data = await browser.storage.local.get(PROCEDURES_KEY);
  const procedures = readValidProcedures(data[PROCEDURES_KEY]);
  const procedure = procedures[origin];
  return procedure;
}

export async function saveProcedure(procedure: ChatSiteProcedure): Promise<void> {
  if (!isValidChatSiteProcedure(procedure, procedure.origin)) {
    throw new Error('Refusing to save an invalid chat-site procedure');
  }
  const data = await browser.storage.local.get(PROCEDURES_KEY);
  const procedures = readValidProcedures(data[PROCEDURES_KEY]);
  procedures[procedure.origin] = procedure;
  await browser.storage.local.set({ [PROCEDURES_KEY]: procedures });
}
