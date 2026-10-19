import {
  isValidAutomationStartMessage,
  MAX_TOTAL_MESSAGE_LENGTH,
  type AutomationStartMessage,
} from './automation-validation';
import {
  validateTemplateVariables,
  type VariableDefinition,
} from './variables';

export interface AutomationConfigDraft {
  messages: readonly string[];
  interval: string;
  unit: 'seconds' | 'minutes';
  repeatCount: string;
  timeWindowEnabled: boolean;
  startTime: string;
  endTime: string;
  variables: VariableDefinition[];
}

export interface NormalizedAutomationConfig {
  messages: string[];
  intervalMs: number;
  repeatMode: 'infinite' | 'finite';
  repeatCount: number;
  timeWindowEnabled: boolean;
  startTime: string;
  endTime: string;
  variables: VariableDefinition[];
}

export type AutomationConfigErrorCode =
  | 'sequenceEmpty'
  | 'sequenceTooLong'
  | 'unknownVariables'
  | 'invalidVariableSyntax'
  | 'invalidInterval'
  | 'invalidRepeatCount'
  | 'invalidTimeWindow'
  | 'invalidSettings';

export type AutomationConfigValidation =
  | { ok: true; config: NormalizedAutomationConfig }
  | { ok: false; code: AutomationConfigErrorCode; messageIndex?: number; names?: string[] };

export interface AutomationStartPayload extends AutomationStartMessage {
  type: 'CHAT_AUTOMATION_START';
  variables: VariableDefinition[];
}

/** Normalize editable UI values into the units and fields used by the runtime. */
export function normalizeAutomationConfig(draft: AutomationConfigDraft): NormalizedAutomationConfig {
  const messages = draft.messages.map(message => message.trim());
  const intervalAmount = Number(draft.interval);
  const intervalMs = Math.round(intervalAmount * (draft.unit === 'minutes' ? 60_000 : 1_000));
  const repeatCount = Number(draft.repeatCount);
  return {
    messages,
    intervalMs,
    repeatMode: repeatCount === 0 ? 'infinite' : 'finite',
    repeatCount,
    timeWindowEnabled: draft.timeWindowEnabled,
    startTime: draft.startTime,
    endTime: draft.endTime,
    variables: draft.variables,
  };
}

/** Validate user-editable values before any browser permission or runtime side effects. */
export function validateAutomationConfig(draft: AutomationConfigDraft): AutomationConfigValidation {
  const config = normalizeAutomationConfig(draft);
  if (config.messages.length === 0 || config.messages.some(message => !message)) {
    return { ok: false, code: 'sequenceEmpty' };
  }
  if (config.messages.reduce((total, message) => total + message.length, 0) > MAX_TOTAL_MESSAGE_LENGTH) {
    return { ok: false, code: 'sequenceTooLong' };
  }

  for (let index = 0; index < config.messages.length; index++) {
    const message = config.messages[index]!;
    const unknown = validateTemplateVariables(message, config.variables, 'automation');
    if (unknown.length > 0) return { ok: false, code: 'unknownVariables', messageIndex: index + 1, names: unknown };
    const residual = message.replace(/{{\s*[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*\s*}}/g, '');
    if (residual.includes('{{') || residual.includes('}}')) {
      return { ok: false, code: 'invalidVariableSyntax', messageIndex: index + 1 };
    }
  }

  const amount = Number(draft.interval);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(config.intervalMs)) {
    return { ok: false, code: 'invalidInterval' };
  }
  if (!/^\d+$/.test(draft.repeatCount.trim()) ||
      !Number.isSafeInteger(config.repeatCount) ||
      config.repeatCount < 0) {
    return { ok: false, code: 'invalidRepeatCount' };
  }
  if (config.timeWindowEnabled && config.startTime === config.endTime) {
    return { ok: false, code: 'invalidTimeWindow' };
  }

  const payload = buildAutomationStartPayload(config);
  if (!isValidAutomationStartMessage(payload)) return { ok: false, code: 'invalidSettings' };
  return { ok: true, config };
}

/** Build the exact runtime message from a previously validated configuration. */
export function buildAutomationStartPayload(config: NormalizedAutomationConfig): AutomationStartPayload {
  return {
    type: 'CHAT_AUTOMATION_START',
    messages: config.messages,
    variables: config.variables,
    intervalMs: config.intervalMs,
    repeatMode: config.repeatMode,
    repeatCount: config.repeatCount,
    timeWindowEnabled: config.timeWindowEnabled,
    startTime: config.startTime,
    endTime: config.endTime,
  };
}
