import React from 'react';
import { Alert, Badge, Button, Card, Select, Textarea } from '@mantine/core';
import type { VariableDefinition, VariableScope } from '../../../lib/variables';
import type { Locale } from '../../../lib/i18n';
import type { TemplatePreviewResult } from '../../../lib/template-preview';
import { translate } from '../../../lib/i18n';
import TemplateTextarea from '../components/TemplateTextarea';

type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;

interface VariablesPageProps {
  t: Translate;
  locale: Locale;
  editingVariableId: string | null;
  variableName: string;
  setVariableName: (value: string) => void;
  variableValue: string;
  setVariableValue: (value: string) => void;
  variableScope: VariableScope;
  setVariableScope: (value: VariableScope) => void;
  variableError: string;
  saveVariable: () => void;
  cancelEditing: () => void;
  variables: VariableDefinition[];
  editVariable: (item: VariableDefinition) => void;
  deleteVariable: (item: VariableDefinition) => void;
  variablesDocument: string;
  setVariablesDocument: (value: string) => void;
  saveVariableDocument: () => void;
  variablePreviewText: string;
  setVariablePreviewText: (value: string) => void;
  variablePreviewResult: TemplatePreviewResult | null;
  variablePreviewError: string;
}

export default function VariablesPage(props: VariablesPageProps) {
  const {
    t, locale, variableScope, setVariableScope, variableError, variables,
    variablesDocument, setVariablesDocument, saveVariableDocument,
    variablePreviewText, setVariablePreviewText, variablePreviewResult, variablePreviewError,
  } = props;
  const fr = locale === 'fr';
  return <>
    <div className="page-heading"><h2>{t('variables')}</h2></div>
    <section className="variable-form">
      <h3>{fr ? 'Définition des variables' : 'Variable definitions'}</h3>
      <p className="helper">{fr
        ? 'Définissez toutes les variables dans un seul champ. Le format est détecté automatiquement : JSON (objet) ou YAML (une variable par ligne). Les variables existantes conservent leur portée.'
        : 'Define all variables in one field. The format is detected automatically: JSON (object) or YAML (one variable per line). Existing variables keep their scope.'}</p>
      <label htmlFor="variables-document">{fr ? 'Variables (JSON ou YAML)' : 'Variables (JSON or YAML)'}</label>
      <Textarea
        id="variables-document"
        className="variables-document"
        value={variablesDocument}
        onChange={event => setVariablesDocument(event.currentTarget.value)}
        minRows={10}
        autosize
        maxRows={24}
        spellCheck={false}
        aria-describedby="variables-document-help"
        placeholder={`{\n  "prenom": "Alexandre",\n  "ville": "Nantes"\n}`}
      />
      <p id="variables-document-help" className="helper">{fr
        ? 'JSON : {"prenom": "Alexandre"} · YAML : prenom: Alexandre. Les valeurs doivent être des chaînes, nombres ou booléens. Les noms suivent les règles {{nom}}.'
        : 'JSON: {"first_name": "Alex"} · YAML: first_name: Alex. Values must be strings, numbers, or booleans. Names follow the {{name}} rules.'}</p>
      <label htmlFor="variable-scope">{fr ? 'Portée des nouvelles variables' : 'Scope for new variables'}</label>
      <Select id="variable-scope" value={variableScope} onChange={value => { if (value === 'global' || value === 'automation') setVariableScope(value); }} data={[{ value: 'global', label: t('globalScope') }, { value: 'automation', label: t('automationScope') }]} />
      {variableError ? <Alert className="variable-error" color="red" variant="light" role="alert">{variableError}</Alert> : null}
      <Button className="primary" onClick={() => void saveVariableDocument()}>{fr ? 'Valider et enregistrer les variables' : 'Validate and save variables'}</Button>
    </section>

    <section className="variable-list-section">
      <div className="section-head"><h2>{t('savedVariables', { count: variables.length })}</h2></div>
      {variables.length === 0 ? <p className="empty">{t('noVariables')}</p> : <div className="variable-list">{variables.map(item =>
        <Card component="article" className="variable-card" key={item.id} padding="sm" withBorder>
          <div className="variable-card-head"><code>{`{{${item.name}}}`}</code><Badge size="xs" variant="light">{item.scope === 'global' ? t('globalVariable') : t('automation')}</Badge></div>
          <p>{item.value}</p>
        </Card>
      )}</div>}
    </section>

    <section className="variable-preview"><h3>{t('previewResolution')}</h3><p className="helper">{t('previewHelp')}</p><label htmlFor="variable-preview-input">{t('testTemplate')}</label><TemplateTextarea t={t} id="variable-preview-input" value={variablePreviewText} onChange={setVariablePreviewText} variables={variables} placeholder="Bonjour {{prenom}}" rows={2} />
      {variablePreviewError ? <Alert className="variable-error" color="red" variant="light" role="alert">{variablePreviewError}</Alert> : variablePreviewResult ? <Card className="preview-result" padding="sm" withBorder><strong>{t('result')}</strong><p>{variablePreviewResult.text || t('enterTemplate')}</p>{variablePreviewResult.unknownVariables.length > 0 ? <small>{t('missingVariables', { names: variablePreviewResult.unknownVariables.map(name => `{{${name}}}`).join(', ') })}</small> : null}</Card> : null}
    </section>
  </>;
}
