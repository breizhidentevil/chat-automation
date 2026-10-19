import { useEffect, useState } from 'react';
import {
  isValidVariableName,
  MAX_VARIABLE_VALUE_LENGTH,
  MAX_VARIABLE_DEFINITIONS,
  MAX_TOTAL_VARIABLE_VALUE_LENGTH,
  type VariableDefinition,
  type VariableScope,
} from '../../../lib/variables';
import { parseVariableDocument } from '../../../lib/variable-document';
import { loadStoredVariables, saveStoredVariables } from '../../../services/variables-storage';
import type { Locale } from '../../../lib/i18n';
import { translate } from '../../../lib/i18n';

type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;

interface UseVariablesOptions {
  t: Translate;
  locale: Locale;
  onSaved: (name: string) => void;
}

function serializeVariables(variables: VariableDefinition[]): string {
  return JSON.stringify(Object.fromEntries(variables.map(item => [item.name, item.value])), null, 2);
}

export function useVariables({ t, locale, onSaved }: UseVariablesOptions) {
  const [variables, setVariables] = useState<VariableDefinition[]>([]);
  const [variablesDocument, setVariablesDocument] = useState('{
  "prenom": "Alexandre"
}');
  const [variableName, setVariableName] = useState('');
  const [variableValue, setVariableValue] = useState('');
  const [variableScope, setVariableScope] = useState<VariableScope>('global');
  const [editingVariableId, setEditingVariableId] = useState<string | null>(null);
  const [variableError, setVariableError] = useState('');

  useEffect(() => {
    let mounted = true;
    void loadStoredVariables(key => browser.storage.local.get(key))
      .then(saved => {
        if (!mounted) return;
        setVariables(saved);
        setVariablesDocument(serializeVariables(saved));
      })
      .catch(error => {
        if (!mounted) return;
        console.error('[Chat Automation] Lecture des variables échouée.', error);
        setVariableError(t('variablesReadError'));
      });
    return () => { mounted = false; };
  }, []);

  async function persistVariables(next: VariableDefinition[]): Promise<boolean> {
    try {
      const safeNext = await saveStoredVariables(items => browser.storage.local.set(items), next);
      setVariables(safeNext);
      setVariablesDocument(serializeVariables(safeNext));
      setVariableError('');
      return true;
    } catch (error) {
      console.error('[Chat Automation] Écriture des variables échouée.', error);
      setVariableError(t('variablesSaveError'));
      return false;
    }
  }

  async function saveVariableDocument() {
    setVariableError('');
    let parsed: Record<string, string>;
    try {
      parsed = parseVariableDocument(variablesDocument);
    } catch (error) {
      setVariableError(error instanceof Error ? error.message : (locale === 'fr' ? 'Document de variables invalide.' : 'Invalid variables document.'));
      return;
    }

    const existingByName = new Map(variables.map(item => [item.name, item]));
    const next: VariableDefinition[] = Object.entries(parsed).map(([name, value]) => {
      const existing = existingByName.get(name);
      return {
        id: existing?.id ?? `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`,
        name,
        type: 'static',
        value,
        scope: existing?.scope ?? variableScope,
        updatedAt: Date.now(),
      };
    });
    const totalValueLength = next.reduce((total, variable) => total + variable.value.length, 0);
    if (next.length > MAX_VARIABLE_DEFINITIONS || totalValueLength > MAX_TOTAL_VARIABLE_VALUE_LENGTH) {
      setVariableError(locale === 'fr'
        ? 'Limite atteinte : 100 variables et 1 000 000 caractères cumulés au maximum.'
        : 'Limit reached: at most 100 variables and 1,000,000 combined characters.');
      return;
    }
    if (!await persistVariables(next)) return;
    setEditingVariableId(null);
    onSaved(locale === 'fr' ? 'Variables' : 'Variables');
  }

  async function saveVariable() {
    setVariableError('');
    const name = variableName.trim();
    if (!isValidVariableName(name)) { setVariableError(t('invalidVariableName')); return; }
    if (!variableValue.trim()) { setVariableError(t('emptyVariableValue')); return; }
    if (variableValue.length > MAX_VARIABLE_VALUE_LENGTH) { setVariableError(t('variableValueTooLong')); return; }
    if (variables.some(item => item.name === name && item.scope === variableScope && item.id !== editingVariableId)) {
      setVariableError(t('duplicateVariable'));
      return;
    }
    const item: VariableDefinition = {
      id: editingVariableId ?? `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name, type: 'static', value: variableValue, scope: variableScope, updatedAt: Date.now(),
    };
    const next = editingVariableId
      ? variables.map(existing => existing.id === editingVariableId ? item : existing)
      : [...variables, item];
    const totalValueLength = next.reduce((total, variable) => total + variable.value.length, 0);
    if (next.length > MAX_VARIABLE_DEFINITIONS || totalValueLength > MAX_TOTAL_VARIABLE_VALUE_LENGTH) {
      setVariableError(locale === 'fr'
        ? 'Limite atteinte : 100 variables et 1 000 000 caractères cumulés au maximum.'
        : 'Limit reached: at most 100 variables and 1,000,000 combined characters.');
      return;
    }
    if (!await persistVariables(next)) return;
    cancelEditing();
    onSaved(name);
  }

  function editVariable(item: VariableDefinition) {
    setEditingVariableId(item.id);
    setVariableName(item.name);
    setVariableValue(item.value);
    setVariableScope(item.scope);
    setVariableError('');
  }

  function cancelEditing() {
    setEditingVariableId(null);
    setVariableName('');
    setVariableValue('');
    setVariableScope('global');
    setVariableError('');
  }

  async function deleteVariable(item: VariableDefinition) {
    if (!window.confirm(t('confirmDeleteVariable', { name: item.name }))) return;
    await persistVariables(variables.filter(existing => existing.id !== item.id));
    if (editingVariableId === item.id) cancelEditing();
  }

  return {
    variables, variablesDocument, setVariablesDocument, saveVariableDocument,
    variableName, setVariableName, variableValue, setVariableValue,
    variableScope, setVariableScope, editingVariableId, variableError,
    saveVariable, editVariable, deleteVariable, cancelEditing,
  };
}
