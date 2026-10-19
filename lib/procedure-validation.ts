import type { ChatSiteProcedure } from './contracts';

const MAX_SELECTOR_LENGTH = 2048;

function isNormalizedHttpOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

function isValidSelector(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= MAX_SELECTOR_LENGTH && value.trim() === value;
}

function isValidCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isValidChatSiteProcedure(value: unknown, expectedOrigin?: string): value is ChatSiteProcedure {
  if (!value || typeof value !== 'object') return false;
  const procedure = value as Partial<ChatSiteProcedure>;
  if (procedure.schemaVersion !== 2 || !isNormalizedHttpOrigin(procedure.origin)) return false;
  if (expectedOrigin !== undefined && procedure.origin !== expectedOrigin) return false;
  if (!isValidSelector(procedure.inputSelector)) return false;
  if (!isValidTimestamp(procedure.updatedAt) || !isValidCount(procedure.successCount) || !isValidCount(procedure.failureCount)) return false;
  if (procedure.lastSuccessAt !== undefined &&
      (!isValidTimestamp(procedure.lastSuccessAt) || procedure.lastSuccessAt > procedure.updatedAt)) return false;
  const strategy = procedure.sendStrategy;
  if (!strategy || typeof strategy !== 'object') return false;
  if (strategy.method === 'button') {
    return isValidSelector(strategy.selector) &&
      typeof strategy.confidence === 'number' && Number.isFinite(strategy.confidence) &&
      strategy.confidence >= 0 && strategy.confidence <= 1;
  }
  if (strategy.method === 'enter' || strategy.method === 'unknown') {
    return typeof strategy.confidence === 'number' && Number.isFinite(strategy.confidence) &&
      strategy.confidence >= 0 && strategy.confidence <= 1;
  }
  return false;
}
