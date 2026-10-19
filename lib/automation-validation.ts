export interface AutomationStartMessage {
  messages: string[];
  intervalMs: number;
  repeatMode: 'infinite' | 'finite';
  repeatCount: number;
  startTime: string;
  endTime: string;
  timeWindowEnabled: boolean;
  variables?: unknown;
}

const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 31 * 24 * 60 * 60 * 1_000;
const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 100_000;
export const MAX_TOTAL_MESSAGE_LENGTH = 1_000_000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidAutomationStartMessage(value: unknown): value is AutomationStartMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;

  if (!Array.isArray(message.messages) ||
      message.messages.length === 0 ||
      message.messages.length > MAX_MESSAGES ||
      !message.messages.every((item: unknown) =>
        typeof item === 'string' && item.trim().length > 0 && item.length <= MAX_MESSAGE_LENGTH
      ) ||
      message.messages.reduce((total, item) => total + (typeof item === 'string' ? item.length : 0), 0) > MAX_TOTAL_MESSAGE_LENGTH) return false;

  if (typeof message.intervalMs !== 'number' ||
      !Number.isSafeInteger(message.intervalMs) ||
      message.intervalMs < MIN_INTERVAL_MS ||
      message.intervalMs > MAX_INTERVAL_MS) return false;

  if (message.repeatMode !== 'infinite' && message.repeatMode !== 'finite') return false;
  if (typeof message.repeatCount !== 'number' ||
      !Number.isSafeInteger(message.repeatCount) ||
      message.repeatCount < 0 ||
      (message.repeatMode === 'finite' && message.repeatCount < 1) ||
      (message.repeatMode === 'infinite' && message.repeatCount !== 0)) return false;

  if (typeof message.startTime !== 'string' || !TIME_PATTERN.test(message.startTime)) return false;
  if (typeof message.endTime !== 'string' || !TIME_PATTERN.test(message.endTime)) return false;
  if (typeof message.timeWindowEnabled !== 'boolean') return false;
  if (message.timeWindowEnabled && message.startTime === message.endTime) return false;

  return true;
}
