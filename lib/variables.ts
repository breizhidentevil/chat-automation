/**
 * Variable definitions and LiquidJS-backed message template rendering.
 * Legacy {{name}} and {{module.collection[0].field}} tokens remain supported;
 * Liquid adds filters, conditionals, loops, and default values.
 */
import { Liquid } from 'liquidjs';
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
export const MAX_VARIABLE_DEFINITIONS = 100;
export const MAX_TOTAL_VARIABLE_VALUE_LENGTH = 1_000_000;

export function isValidVariableDefinition(value: unknown): value is VariableDefinition {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<VariableDefinition>;
  return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= MAX_VARIABLE_ID_LENGTH &&
    isValidVariableName(item.name) && !DYNAMIC_ROOTS.has(item.name) &&
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
  let totalValueLength = 0;
  for (const candidate of value) {
    if (valid.length >= MAX_VARIABLE_DEFINITIONS) break;
    if (!isValidVariableDefinition(candidate)) continue;
    const nameKey = `${candidate.scope}:${candidate.name}`;
    if (seenIds.has(candidate.id) || seenNames.has(nameKey)) continue;
    if (totalValueLength + candidate.value.length > MAX_TOTAL_VARIABLE_VALUE_LENGTH) continue;
    seenIds.add(candidate.id);
    seenNames.add(nameKey);
    totalValueLength += candidate.value.length;
    valid.push(candidate);
  }
  return valid;
}

const TEMPLATE_TOKEN = /{{\s*([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*)\s*}}/g;
const DYNAMIC_ROOTS = new Set(['system', 'automation', 'chat', 'history', 'logs', 'strategy', 'data']);
const BLOCKED_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);

// Do not expose inherited properties or dynamic partial/template loading to user-authored messages.
const liquid = new Liquid({
  ownPropertyOnly: true,
  strictFilters: true,
  strictVariables: false,
  dynamicPartials: false,
  templates: {},
  parseLimit: 100_000,
  renderLimit: 250,
  memoryLimit: 100_000,
});

// Message templates are self-contained: never load filesystem, URL, or extension partials.
delete liquid.tags.include;
delete liquid.tags.render;
delete liquid.tags.layout;
delete liquid.tags.block;

export function isValidVariableName(value: unknown): value is string {
  return typeof value === 'string' && VARIABLE_NAME_PATTERN.test(value) && !BLOCKED_PATH_PARTS.has(value) && !DYNAMIC_ROOTS.has(value);
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

  const openingDelimiters = template.match(/{{/g)?.length ?? 0;
  const closingDelimiters = template.match(/}}/g)?.length ?? 0;
  if (openingDelimiters !== closingDelimiters) {
    throw new Error('Syntaxe de variable invalide. Utilisez {{nom}}, les filtres Liquid et les balises {% ... %}.');
  }

  // Liquid introduces local names through loops, assignments, and captures.
  const liquidLocals = new Set<string>(['forloop', 'tablerowloop']);
  for (const match of template.matchAll(/{%\s*(?:for|tablerow)\s+([A-Za-z_][A-Za-z0-9_-]*)\s+in\b/g)) liquidLocals.add(match[1]!);
  for (const match of template.matchAll(/{%\s*(?:assign|capture)\s+([A-Za-z_][A-Za-z0-9_-]*)\b/g)) liquidLocals.add(match[1]!);

  const unknown = validateTemplateVariables(template, variables, scope)
    .filter(name => !liquidLocals.has(name.split(/[.[]/, 1)[0] ?? ''));
  if (unknown.length > 0) throw new Error(`Variable(s) inconnue(s) : ${unknown.map(name => `{{${name}}}`).join(', ')}. Créez-les dans la page Variables.`);

  const variablesUsed = findTemplateVariables(template);
  const rootData: Record<string, unknown> = {
    ...dynamicData,
    ...Object.fromEntries([...byName.entries()].map(([name, definition]) => [name, definition.value])),
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

  // Preserve the legacy resolver's explicit errors and blocked-path checks for simple tokens.
  for (const name of variablesUsed) {
    if (isDynamicPath(name)) readPath(rootData, name);
  }

  try {
    const text = await liquid.parseAndRender(template, rootData);
    return { text, variablesUsed };
  } catch (error) {
    if (error instanceof Error && /unexpected|parse|tag|syntax/i.test(error.name + ' ' + error.message)) {
      throw new Error(`Syntaxe de template Liquid invalide : ${error.message}`);
    }
    throw error;
  }
}
