/**
 * Variable resolver for static user variables and dynamic data paths.
 * Templates use {{name}} for custom variables and {{module.collection[0].field}}
 * for dynamic values. Paths may contain any number of property/index segments.
 */
export type VariableScope = 'global' | 'automation';

export interface VariableDefinition {
  id: string;
  name: string;
  type: 'static';
  value: string;
  scope: VariableScope;
  updatedAt: number;
}

export interface VariableResolutionContext {
  iteration: number;
  messageIndex: number;
  timestamp: Date;
}

export interface VariableResolutionResult {
  text: string;
  variablesUsed: string[];
}

export const VARIABLES_STORAGE_KEY = 'chatAutomationVariables';
export const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

const MAX_VARIABLE_ID_LENGTH = 256;
export const MAX_VARIABLE_VALUE_LENGTH = 100_000;

export function isValidVariableDefinition(value: unknown): value is VariableDefinition {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<VariableDefinition>;
  return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= MAX_VARIABLE_ID_LENGTH &&
    isValidVariableName(item.name) &&
    item.type === 'static' && typeof item.value === 'string' &&
    item.value.length <= MAX_VARIABLE_VALUE_LENGTH &&
    (item.scope === 'global' || item.scope === 'automation') &&
    typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) && item.updatedAt >= 0;
}

export function filterValidVariableDefinitions(value: unknown): VariableDefinition[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const valid: VariableDefinition[] = [];
  for (const candidate of value) {
    if (!isValidVariableDefinition(candidate)) continue;
    const nameKey = `${candidate.scope}:${candidate.name}`;
    if (seenIds.has(candidate.id) || seenNames.has(nameKey)) continue;
    seenIds.add(candidate.id);
    seenNames.add(nameKey);
    valid.push(candidate);
  }
  return valid;
}

const TEMPLATE_TOKEN = /{{\s*([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*)\s*}}/g;
const DYNAMIC_ROOTS = new Set(['system', 'automation', 'chat', 'history', 'logs', 'strategy', 'data']);
const BLOCKED_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);

export function isValidVariableName(value: unknown): value is string {
  return typeof value === 'string' && VARIABLE_NAME_PATTERN.test(value) && !BLOCKED_PATH_PARTS.has(value);
}

export function findTemplateVariables(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(TEMPLATE_TOKEN)) names.add(match[1]!);
  return [...names];
}

function isDynamicPath(name: string): boolean {
  const root = name.split(/[.[]/, 1)[0] ?? '';
  return DYNAMIC_ROOTS.has(root);
}

export function validateTemplateVariables(template: string, variables: VariableDefinition[], scope: VariableScope = 'automation'): string[] {
  const available = new Set(filterValidVariableDefinitions(variables)
    .filter(variable => variable.scope === 'global' || variable.scope === scope)
    .map(variable => variable.name));
  return findTemplateVariables(template).filter(name => !isDynamicPath(name) && !available.has(name));
}

function tokenizePath(path: string): Array<string | number> {
  const parts: Array<string | number> = [];
  const matcher = /([A-Za-z_][A-Za-z0-9_-]*)|\[(\d+)\]/g;
  for (const match of path.matchAll(matcher)) {
    const part = match[1] ?? match[2];
    if (part === undefined) continue;
    if (match[1] && BLOCKED_PATH_PARTS.has(match[1])) throw new Error(`Segment de chemin interdit dans « ${path} ».`);
    parts.push(match[1] ? match[1] : Number(part));
  }
  if (parts.length === 0) throw new Error(`Chemin de variable invalide : « ${path} ».`);
  return parts;
}

function readPath(root: unknown, path: string): string {
  let current: unknown = root;
  for (const part of tokenizePath(path)) {
    if (current === null || current === undefined) throw new Error(`La variable « ${path} » ne peut pas être résolue : donnée absente avant « ${String(part)} ».`);
    if (typeof part === 'number') {
      if (!Array.isArray(current)) throw new Error(`La variable « ${path} » utilise un index sur une valeur qui n’est pas un tableau.`);
      if (part < 0 || part >= current.length) throw new Error(`Index hors limites dans « ${path} » (index ${part}, taille ${current.length}).`);
      current = current[part];
    } else {
      if (typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) throw new Error(`Propriété « ${part} » introuvable dans « ${path} ».`);
      current = (current as Record<string, unknown>)[part];
    }
  }
  if (current === null || current === undefined) throw new Error(`La variable « ${path} » ne contient aucune valeur.`);
  if (typeof current === 'object') return JSON.stringify(current);
  return String(current);
}

export async function resolveMessageTemplate(
  template: string,
  variables: VariableDefinition[],
  context: VariableResolutionContext,
  scope: VariableScope = 'automation',
  dynamicData: Record<string, unknown> = {},
): Promise<VariableResolutionResult> {
  const applicable = filterValidVariableDefinitions(variables).filter(variable => variable.scope === 'global' || variable.scope === scope);
  const byName = new Map<string, VariableDefinition>();
  for (const variable of applicable.filter(item => item.scope === 'global')) byName.set(variable.name, variable);
  for (const variable of applicable.filter(item => item.scope === scope && item.scope !== 'global')) byName.set(variable.name, variable);

  const validTemplate = template.replace(TEMPLATE_TOKEN, '');
  if (/{{|}}/.test(validTemplate)) throw new Error('Syntaxe de variable invalide. Utilisez {{nom}} ou un chemin tel que {{history.messages[0].content}}.');
  const unknown = validateTemplateVariables(template, variables, scope);
  if (unknown.length > 0) throw new Error(`Variable(s) inconnue(s) : ${unknown.map(name => `{{${name}}}`).join(', ')}. Créez-les dans la page Variables.`);

  const variablesUsed = findTemplateVariables(template);
  const rootData: Record<string, unknown> = {
    ...dynamicData,
    system: {
      runtime: {
        timestamp: context.timestamp.toISOString(),
        date: context.timestamp.toLocaleDateString(),
        time: context.timestamp.toLocaleTimeString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
    automation: {
      ...(dynamicData.automation && typeof dynamicData.automation === 'object' ? dynamicData.automation as Record<string, unknown> : {}),
      sequence: {
        ...((dynamicData.automation && typeof dynamicData.automation === 'object' && (dynamicData.automation as Record<string, unknown>).sequence && typeof (dynamicData.automation as Record<string, unknown>).sequence === 'object') ? (dynamicData.automation as Record<string, unknown>).sequence as Record<string, unknown> : {}),
        iteration: context.iteration,
      },
      message: {
        ...((dynamicData.automation && typeof dynamicData.automation === 'object' && (dynamicData.automation as Record<string, unknown>).message && typeof (dynamicData.automation as Record<string, unknown>).message === 'object') ? (dynamicData.automation as Record<string, unknown>).message as Record<string, unknown> : {}),
        index: context.messageIndex,
      },
    },
  };

  const text = template.replace(TEMPLATE_TOKEN, (_match, name: string) => {
    if (!isDynamicPath(name)) return byName.get(name)!.value;
    return readPath(rootData, name);
  });
  return { text, variablesUsed };
}
