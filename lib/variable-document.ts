import { isValidVariableName, MAX_VARIABLE_DEFINITIONS, MAX_VARIABLE_VALUE_LENGTH, MAX_TOTAL_VARIABLE_VALUE_LENGTH } from './variables';

export type VariableDocumentFormat = 'json' | 'yaml';

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
      if (character === '\\') { index += 1; continue; }
      if (character === "'") quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '#' && (index === 0 || /\s/.test(value[index - 1]!))) return value.slice(0, index).trimEnd();
  }
  return value.trimEnd();
}

function parseScalar(value: string, lineNumber: number): string {
  const trimmed = stripYamlComment(value).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed !== 'string') throw new Error();
      return parsed;
    } catch {
      throw new Error(`Valeur entre guillemets doubles invalide à la ligne ${lineNumber}.`);
    }
  }
  if (trimmed.startsWith("'")) {
    if (!trimmed.endsWith("'") || trimmed.length < 2) throw new Error(`Valeur entre guillemets simples invalide à la ligne ${lineNumber}.`);
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed.replace(/\s+#.*$/, '').trim();
}

/** Parse a flat JSON object or a flat YAML mapping of variable names to scalar strings. */
export function parseVariableDocument(source: string): Record<string, string> {
  const input = source.trim();
  if (!input) throw new Error('Définissez au moins une variable.');

  let values: Record<string, unknown>;
  if (input.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch (cause) {
      throw new Error(`JSON invalide : ${cause instanceof Error ? cause.message : 'syntaxe incorrecte'}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Le JSON doit être un objet dont les clés sont les noms des variables.');
    }
    values = parsed as Record<string, unknown>;
  } else {
    values = {};
    for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line === '---' || line === '...') continue;
      if (/^\s/.test(rawLine)) throw new Error(`Le YAML doit être une liste plate (ligne ${index + 1}).`);
      const separator = rawLine.indexOf(':');
      if (separator <= 0) throw new Error(`Syntaxe YAML invalide à la ligne ${index + 1} : utilisez nom: valeur.`);
      const rawName = rawLine.slice(0, separator).trim();
      let name = rawName;
      if (rawName.startsWith('"') || rawName.startsWith("'")) name = parseScalar(rawName, index + 1);
      if (Object.prototype.hasOwnProperty.call(values, name)) throw new Error(`Variable dupliquée : « ${name} ».`);
      values[name] = parseScalar(rawLine.slice(separator + 1), index + 1);
    }
  }

  const entries = Object.entries(values);
  if (entries.length === 0 && !(input.startsWith('{') && input.endsWith('}'))) throw new Error('Définissez au moins une variable.');
  if (entries.length > MAX_VARIABLE_DEFINITIONS) throw new Error(`Limite de ${MAX_VARIABLE_DEFINITIONS} variables dépassée.`);

  const result: Record<string, string> = {};
  let totalLength = 0;
  for (const [name, value] of entries) {
    if (!isValidVariableName(name)) throw new Error(`Nom de variable invalide : « ${name} ».`);
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error(`La valeur de « ${name} » doit être une chaîne, un nombre ou un booléen (pas de tableau ou d’objet imbriqué).`);
    }
    const stringValue = String(value);
    if (!stringValue.trim()) throw new Error(`La valeur de « ${name} » ne peut pas être vide.`);
    if (stringValue.length > MAX_VARIABLE_VALUE_LENGTH) throw new Error(`La valeur de « ${name} » dépasse la limite autorisée.`);
    totalLength += stringValue.length;
    if (totalLength > MAX_TOTAL_VARIABLE_VALUE_LENGTH) throw new Error('La taille cumulée des valeurs dépasse la limite autorisée.');
    result[name] = stringValue;
  }
  return result;
}

export function detectVariableDocumentFormat(source: string): VariableDocumentFormat {
  return source.trimStart().startsWith('{') ? 'json' : 'yaml';
}
