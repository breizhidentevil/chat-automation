import { isValidVariableName, MAX_VARIABLE_DEFINITIONS, MAX_VARIABLE_VALUE_LENGTH, MAX_TOTAL_VARIABLE_VALUE_LENGTH } from './variables';

export type VariableDocumentFormat = 'json' | 'yaml';

const MAX_NESTING_DEPTH = 12;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const NESTED_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function stripYamlComment(value: string): string {
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quote === '"') {
      if (character === '\\') { index += 1; continue; }
      if (character === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (character === "'" && value[index + 1] === "'") { index += 1; continue; }
      if (character === "'") quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '#' && (index === 0 || /\s/.test(value[index - 1]!))) return value.slice(0, index).trimEnd();
  }
  return value.trimEnd();
}

function parseYamlScalar(value: string, lineNumber: number): unknown {
  const trimmed = stripYamlComment(value).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"')) {
    try { return JSON.parse(trimmed) as string; }
    catch { throw new Error(`Valeur entre guillemets doubles invalide à la ligne ${lineNumber}.`); }
  }
  if (trimmed.startsWith("'")) {
    if (!trimmed.endsWith("'") || trimmed.length < 2) throw new Error(`Valeur entre guillemets simples invalide à la ligne ${lineNumber}.`);
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === 'null' || trimmed === '~') return '';
  return trimmed;
}

function parseYamlMapping(source: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; value: Record<string, unknown> }> = [{ indent: -1, value: root }];
  const seen = new Set<string>();
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#') || ['---', '...'].includes(rawLine.trim())) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    if (indent % 2 !== 0) throw new Error(`Utilisez une indentation YAML par multiples de deux espaces (ligne ${index + 1}).`);
    const line = stripYamlComment(rawLine.trim()).trim();
    const separator = line.indexOf(':');
    if (separator <= 0) throw new Error(`Syntaxe YAML invalide à la ligne ${index + 1} : utilisez nom: valeur.`);
    const rawName = line.slice(0, separator).trim();
    const nameValue = parseYamlScalar(rawName, index + 1);
    if (typeof nameValue !== 'string' || !nameValue) throw new Error(`Nom de clé YAML invalide à la ligne ${index + 1}.`);
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) stack.pop();
    const parent = stack[stack.length - 1]!;
    if (indent > parent.indent + 2) throw new Error(`Indentation YAML inattendue à la ligne ${index + 1} : un niveau ne peut augmenter que de deux espaces.`);
    if (rawLine.slice(0, indent).includes('\t')) throw new Error(`Les tabulations sont interdites pour l’indentation YAML (ligne ${index + 1}).`);
    if (!NESTED_KEY_PATTERN.test(nameValue) || BLOCKED_KEYS.has(nameValue)) throw new Error(`Nom de clé YAML invalide ou interdit à la ligne ${index + 1}.`);
    const fullPath = [...stack.slice(1).map(entry => entry.indent), indent].join(':') + ':' + rawName;
    if (seen.has(fullPath)) throw new Error(`Clé YAML dupliquée : « ${rawName} » (ligne ${index + 1}).`);
    seen.add(fullPath);
    const rawValue = line.slice(separator + 1).trim();
    if (!rawValue) {
      const nested: Record<string, unknown> = {};
      if (Object.prototype.hasOwnProperty.call(parent.value, nameValue)) throw new Error(`Clé YAML dupliquée : « ${rawName} ».`);
      parent.value[nameValue] = nested;
      stack.push({ indent, value: nested });
    } else {
      if (Object.prototype.hasOwnProperty.call(parent.value, nameValue)) throw new Error(`Clé YAML dupliquée : « ${rawName} ».`);
      parent.value[nameValue] = parseYamlScalar(rawValue, index + 1);
    }
  }
  return root;
}

/**
 * Parse JSON or YAML variable mappings. Nested objects and arrays are stored as
 * JSON strings so the existing storage format remains backward compatible.
 */
export function parseVariableDocument(source: string): Record<string, string> {
  const input = source.trim();
  if (!input) throw new Error('Définissez au moins une variable.');

  let values: Record<string, unknown>;
  if (input.startsWith('{')) {
    let parsed: unknown;
    try { parsed = JSON.parse(input); }
    catch (cause) { throw new Error(`JSON invalide : ${cause instanceof Error ? cause.message : 'syntaxe incorrecte'}`); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Le JSON doit être un objet dont les clés sont les noms des variables.');
    }
    values = parsed as Record<string, unknown>;
  } else {
    values = parseYamlMapping(source);
  }

  validateNestedValue(values, 'document', 0);

  const entries = Object.entries(values);
  if (entries.length === 0 && !(input.startsWith('{') && input.endsWith('}'))) throw new Error('Définissez au moins une variable.');
  if (entries.length > MAX_VARIABLE_DEFINITIONS) throw new Error(`Limite de ${MAX_VARIABLE_DEFINITIONS} variables dépassée.`);

  const result: Record<string, string> = {};
  let totalLength = 0;
  for (const [name, value] of entries) {
    if (!isValidVariableName(name)) throw new Error(`Nom de variable invalide : « ${name} ».`);
    if (value === null || value === undefined) throw new Error(`La valeur de « ${name} » ne peut pas être nulle.`);
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (!stringValue.trim()) throw new Error(`La valeur de « ${name} » ne peut pas être vide.`);
    if (stringValue.length > MAX_VARIABLE_VALUE_LENGTH) throw new Error(`La valeur de « ${name} » dépasse la limite autorisée.`);
    totalLength += stringValue.length;
    if (totalLength > MAX_TOTAL_VARIABLE_VALUE_LENGTH) throw new Error('La taille cumulée des valeurs dépasse la limite autorisée.');
    result[name] = stringValue;
  }
  return result;
}

function validateNestedValue(value: unknown, path: string, depth: number): void {
  if (depth > MAX_NESTING_DEPTH) throw new Error(`La structure « ${path} » dépasse la profondeur maximale de ${MAX_NESTING_DEPTH} niveaux.`);
  if (value === null || value === undefined) throw new Error(`La valeur « ${path} » ne peut pas être nulle.`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`La valeur « ${path} » doit être un nombre fini.`);
  if (typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNestedValue(item, `${path}[${index}]`, depth + 1));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!NESTED_KEY_PATTERN.test(key) || BLOCKED_KEYS.has(key)) {
      throw new Error(`Clé imbriquée invalide ou interdite : « ${path}.${key} ».`);
    }
    validateNestedValue(child, `${path}.${key}`, depth + 1);
  }
}

export function detectVariableDocumentFormat(source: string): VariableDocumentFormat {
  return source.trimStart().startsWith('{') ? 'json' : 'yaml';
}
