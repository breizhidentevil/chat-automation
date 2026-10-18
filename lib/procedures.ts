import type { ChatSiteProcedure } from './contracts';

const PROCEDURES_KEY = 'chatAutomationProcedures';

export async function getProcedure(origin: string): Promise<ChatSiteProcedure | undefined> {
  const data = await browser.storage.local.get(PROCEDURES_KEY);
  const procedures = (data[PROCEDURES_KEY] as Record<string, ChatSiteProcedure> | undefined) ?? {};
  const procedure = procedures[origin];
  return procedure?.schemaVersion === 2 ? procedure : undefined;
}

export async function saveProcedure(procedure: ChatSiteProcedure): Promise<void> {
  const data = await browser.storage.local.get(PROCEDURES_KEY);
  const procedures = (data[PROCEDURES_KEY] as Record<string, ChatSiteProcedure> | undefined) ?? {};
  await browser.storage.local.set({ [PROCEDURES_KEY]: { ...procedures, [procedure.origin]: procedure } });
}
