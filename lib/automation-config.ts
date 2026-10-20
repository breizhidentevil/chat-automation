import {
  isValidAutomationStartMessage,
  MAX_TOTAL_MESSAGE_LENGTH,
  type AutomationStartMessage,
} from './automation-validation';
import {
  filterValidVariableDefinitions,
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
    // Rebuild each definition from the allowlisted schema before it reaches runtime.
    variables: filterValidVariableDefinitions(draft.variables),
  };
}

function isAutomationConfigDraft(value: unknown): value is AutomationConfigDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  return Array.isArray(draft.messages) &&
    Array.from(draft.messages).every((message: unknown) => typeof message === 'string') &&
    typeof draft.interval === 'string' &&
    (draft.unit === 'seconds' || draft.unit === 'minutes') &&
    typeof draft.repeatCount === 'string' &&
    typeof draft.timeWindowEnabled === 'boolean' &&
    typeof draft.startTime === 'string' &&
    typeof draft.endTime === 'string' &&
    Array.isArray(draft.variables) &&
    filterValidVariableDefinitions(draft.variables).length === draft.variables.length;
}

/** Validate user-editable values before any browser permission or runtime side effects. */
export function validateAutomationConfig(draft: AutomationConfigDraft): AutomationConfigValidation {
  // Treat runtime/storage values as untrusted even though callers are typed.
  // Reject malformed shapes before normalization can throw or silently coerce them.
  if (!isAutomationConfigDraft(draft)) return { ok: false, code: 'invalidSettings' };
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

    // LiquidJS expressions may contain filters and other valid syntax. Only reject
    // structurally broken output delimiters here; the shared resolver handles parsing.
    const openingCount = message.match(/{{/g)?.length ?? 0;
    const closingCount = message.match(/}}/g)?.length ?? 0;
    if (
      openingCount !== closingCount ||
      /{{\s*}}/.test(message)
    ) {
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
