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


export interface SavedAutomationSettings {
  message: string;
  messages: string[];
  interval: string;
  unit: 'seconds' | 'minutes';
  repeatMode: 'infinite' | 'finite';
  repeatCount: string;
  timeWindowEnabled: boolean;
  startTime: string;
  endTime: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validClock(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

/** Normalize untrusted persisted settings to bounded, UI-safe values. */
export function sanitizeSavedAutomationSettings(value: unknown): SavedAutomationSettings | null {
  if (!isRecord(value)) return null;

  const rawMessage = typeof value.message === 'string' ? value.message.slice(0, MAX_MESSAGE_LENGTH) : '';
  const candidateMessages = Array.isArray(value.messages)
    ? value.messages.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= MAX_MESSAGE_LENGTH).slice(0, MAX_MESSAGES)
    : [];
  const messages: string[] = [];
  let totalLength = 0;
  for (const item of candidateMessages) {
    if (totalLength + item.length > MAX_TOTAL_MESSAGE_LENGTH) break;
    messages.push(item);
    totalLength += item.length;
  }
  if (messages.length === 0 && rawMessage.trim()) messages.push(rawMessage);

  const unit: 'seconds' | 'minutes' = value.unit === 'minutes' ? 'minutes' : 'seconds';
  const maxInterval = unit === 'minutes' ? 44_640 : 2_678_400;
  const rawInterval = typeof value.interval === 'string' || typeof value.interval === 'number' ? String(value.interval) : '30';
  const parsedInterval = /^\\d+$/.test(rawInterval) ? Number(rawInterval) : 30;
  const interval = String(Number.isSafeInteger(parsedInterval) && parsedInterval >= 1 && parsedInterval <= maxInterval ? parsedInterval : 30);

  const savedCount = typeof value.repeatCount === 'number' || typeof value.repeatCount === 'string' ? String(value.repeatCount) : '0';
  const countValid = /^\\d+$/.test(savedCount) && Number.isSafeInteger(Number(savedCount)) && Number(savedCount) >= 0;
  const repeatCount = countValid ? savedCount : '0';
  const repeatMode: 'infinite' | 'finite' = value.repeatMode === 'infinite' || Number(repeatCount) === 0 ? 'infinite' : 'finite';

  const startTime = validClock(value.startTime) ? value.startTime : '09:00';
  let endTime = validClock(value.endTime) ? value.endTime : '18:00';
  const timeWindowEnabled = typeof value.timeWindowEnabled === 'boolean' ? value.timeWindowEnabled : true;
  if (timeWindowEnabled && startTime === endTime) endTime = startTime === '18:00' ? '19:00' : '18:00';

  return {
    message: rawMessage,
    messages: messages.length > 0 ? messages : [rawMessage],
    interval,
    unit,
    repeatMode,
    repeatCount: repeatMode === 'infinite' ? '0' : repeatCount,
    timeWindowEnabled,
    startTime,
    endTime,
  };
}
