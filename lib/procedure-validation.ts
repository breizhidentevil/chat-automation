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
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const procedure = value as Partial<ChatSiteProcedure>;
  if (procedure.schemaVersion !== 2 || !isNormalizedHttpOrigin(procedure.origin)) return false;
  if (expectedOrigin !== undefined && procedure.origin !== expectedOrigin) return false;
  if (!isValidSelector(procedure.inputSelector)) return false;
  if (procedure.inputSelectors !== undefined &&
      (!Array.isArray(procedure.inputSelectors) || procedure.inputSelectors.length < 1 || procedure.inputSelectors.length > 8 ||
       !procedure.inputSelectors.every(isValidSelector) || new Set(procedure.inputSelectors).size !== procedure.inputSelectors.length ||
       !procedure.inputSelectors.includes(procedure.inputSelector))) return false;
  if (procedure.inputProfile !== undefined) {
    const profile = procedure.inputProfile;
    if (!profile || typeof profile !== 'object' || Array.isArray(profile) || typeof profile.tagName !== 'string' ||
        !/^[a-z][a-z0-9-]{0,63}$/.test(profile.tagName) || typeof profile.contentEditable !== 'boolean' ||
        ['role', 'ariaLabel', 'name', 'placeholder'].some(key =>
          profile[key as 'role' | 'ariaLabel' | 'name' | 'placeholder'] !== undefined &&
          (typeof profile[key as 'role' | 'ariaLabel' | 'name' | 'placeholder'] !== 'string' ||
           (profile[key as 'role' | 'ariaLabel' | 'name' | 'placeholder'] as string).length > 512))) return false;
  }
  if (!isValidTimestamp(procedure.updatedAt) || !isValidCount(procedure.successCount) || !isValidCount(procedure.failureCount)) return false;
  if (procedure.lastSuccessAt !== undefined &&
      (!isValidTimestamp(procedure.lastSuccessAt) || procedure.lastSuccessAt > procedure.updatedAt)) return false;
  const strategy = procedure.sendStrategy;
  if (!strategy || typeof strategy !== 'object' || Array.isArray(strategy)) return false;
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


/** Return a schema-allowlisted copy of a validated procedure. */
export function sanitizeChatSiteProcedure(value: unknown, expectedOrigin?: string): ChatSiteProcedure | undefined {
  if (!isValidChatSiteProcedure(value, expectedOrigin)) return undefined;
  const procedure = value as ChatSiteProcedure;
  const sanitized: ChatSiteProcedure = {
    origin: procedure.origin,
    schemaVersion: 2,
    inputSelector: procedure.inputSelector,
    sendStrategy: procedure.sendStrategy.method === 'button'
      ? {
          method: 'button',
          selector: procedure.sendStrategy.selector,
          confidence: procedure.sendStrategy.confidence,
        }
      : {
          method: procedure.sendStrategy.method,
          confidence: procedure.sendStrategy.confidence,
        },
    updatedAt: procedure.updatedAt,
    successCount: procedure.successCount,
    failureCount: procedure.failureCount,
  };
  if (procedure.inputSelectors !== undefined) sanitized.inputSelectors = [...procedure.inputSelectors];
  if (procedure.inputProfile !== undefined) {
    const profile = procedure.inputProfile;
    sanitized.inputProfile = {
      tagName: profile.tagName,
      contentEditable: profile.contentEditable,
      ...(profile.role !== undefined ? { role: profile.role } : {}),
      ...(profile.ariaLabel !== undefined ? { ariaLabel: profile.ariaLabel } : {}),
      ...(profile.name !== undefined ? { name: profile.name } : {}),
      ...(profile.placeholder !== undefined ? { placeholder: profile.placeholder } : {}),
    };
  }
  if (procedure.lastSuccessAt !== undefined) sanitized.lastSuccessAt = procedure.lastSuccessAt;
  return sanitized;
}
