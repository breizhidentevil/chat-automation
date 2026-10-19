import React from 'react';
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
  variablePreviewText: string;
  setVariablePreviewText: (value: string) => void;
  variablePreviewResult: TemplatePreviewResult | null;
  variablePreviewError: string;
}

export default function VariablesPage(props: VariablesPageProps) {
  const {
    t, locale, editingVariableId, variableName, setVariableName, variableValue, setVariableValue,
    variableScope, setVariableScope, variableError, saveVariable, cancelEditing,
    variables, editVariable, deleteVariable, variablePreviewText, setVariablePreviewText,
    variablePreviewResult, variablePreviewError,
  } = props;
  return <>

      <div className="page-heading"><h2>{t('variables')}</h2><p>{t('variablesIntro')}</p></div>
      <section className="variable-form">
        <h3>{editingVariableId ? t('editVariable') : t('newVariable')}</h3>
        <label htmlFor="variable-name">{t('name')}</label>
        <input id="variable-name" value={variableName} onChange={event => setVariableName(event.target.value)} placeholder={locale === 'fr' ? 'prenom' : 'first_name'} autoComplete="off" />
        <p className="helper">{t('variableUsage')} <code>{`{{${variableName.trim() || 'name'}}}`}</code></p>
        <label htmlFor="variable-value">{t('staticValue')}</label>
        <textarea id="variable-value" value={variableValue} onChange={event => setVariableValue(event.target.value)} placeholder={locale === 'fr' ? 'Alexandre' : 'Alex'} rows={2} />
        <label htmlFor="variable-scope">{t('scope')}</label>
        <select id="variable-scope" value={variableScope} onChange={event => setVariableScope(event.target.value as VariableScope)}><option value="global">{t('globalScope')}</option><option value="automation">{t('automationScope')}</option></select>
        {variableError ? <p className="variable-error" role="alert">{variableError}</p> : null}
        <div className="variable-form-actions"><button className="primary" onClick={() => void saveVariable()}>{editingVariableId ? t('saveChanges') : t('addVariable')}</button>{editingVariableId ? <button className="secondary" onClick={cancelEditing}>{t('cancel')}</button> : null}</div>
      </section>
      <section className="variable-list-section">
        <div className="section-head"><h2>{t('savedVariables', { count: variables.length })}</h2></div>
        {variables.length === 0 ? <p className="empty">{t('noVariables')}</p> : <div className="variable-list">{variables.map(item => <article className="variable-card" key={item.id}><div className="variable-card-head"><code>{`{{${item.name}}}`}</code><span>{item.scope === 'global' ? t('globalVariable') : t('automation')}</span></div><p>{item.value}</p><div className="variable-card-actions"><button className="secondary" onClick={() => editVariable(item)}>{t('edit')}</button><button className="secondary danger-action" onClick={() => void deleteVariable(item)}>{t('delete')}</button></div></article>)}</div>}
      </section>
      <section className="variable-preview"><h3>{t('previewResolution')}</h3><p className="helper">{t('previewHelp')}</p><label htmlFor="variable-preview-input">{t('testTemplate')}</label><TemplateTextarea t={t} id="variable-preview-input" value={variablePreviewText} onChange={setVariablePreviewText} variables={variables} placeholder="Bonjour {{prenom}}" rows={2} />
        {variablePreviewError ? <p className="variable-error" role="alert">{variablePreviewError}</p> : variablePreviewResult ? <div className="preview-result"><strong>{t('result')}</strong><p>{variablePreviewResult.text || t('enterTemplate')}</p>{variablePreviewResult.unknownVariables.length > 0 ? <small>{t('missingVariables', { names: variablePreviewResult.unknownVariables.map(name => `{{${name}}}`).join(', ') })}</small> : null}</div> : null}
      </section>
    
  </>;
}
