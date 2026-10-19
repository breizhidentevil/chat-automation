import {
  findTemplateVariables,
  resolveMessageTemplate,
  validateTemplateVariables,
  type VariableDefinition,
  type VariableScope,
} from './variables';

export interface TemplatePreviewResult {
  text: string;
  variablesUsed: string[];
  unknownVariables: string[];
}

/** Extract the root path from Liquid output expressions, including filtered expressions. */
function findPreviewPaths(template: string): string[] {
  const paths = new Set(findTemplateVariables(template));
  for (const match of template.matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
    const expression = (match[1] ?? '').split('|', 1)[0]?.trim() ?? '';
    const path = expression.match(/^([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*)$/)?.[1];
    if (path) paths.add(path);
  }
  return [...paths];
}

/**
 * Preview templates with the same LiquidJS resolver used by the simulator/runtime.
 * Dynamic paths are replaced by placeholders because this page has no live runtime context.
 */
export async function previewMessageTemplate(
  template: string,
  variables: VariableDefinition[],
  scope: VariableScope = 'automation',
): Promise<TemplatePreviewResult> {
  const variablesUsed = findPreviewPaths(template);
  const availableNames = new Set(variables
    .filter(variable => variable.scope === 'global' || variable.scope === scope)
    .map(variable => variable.name));
  const dynamicRoots = new Set(['system', 'automation', 'chat', 'history', 'logs', 'strategy', 'data']);
  const unknownVariables = [...new Set([
    ...validateTemplateVariables(template, variables, scope),
    ...variablesUsed.filter(name => {
      const root = name.split(/[.[]/, 1)[0] ?? '';
      return !dynamicRoots.has(root) && !availableNames.has(root);
    }),
  ])];
  const previewVariables = [...variables];
  let previewIndex = 0;

  const maskedTemplate = template.replace(/{{\s*([^{}]+?)\s*}}/g, (token, expression: string) => {
    const path = expression.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*)/)?.[1];
    if (!path) return token;

    const root = path.split(/[.[]/, 1)[0] ?? '';
    const isDynamic = ['system', 'automation', 'chat', 'history', 'logs', 'strategy', 'data'].includes(root);
    const isUnknown = unknownVariables.includes(path);
    if (!isDynamic && !isUnknown) return token;

    const placeholderName = `__chat_automation_preview_${previewIndex++}`;
    previewVariables.push({
      id: `preview:${placeholderName}`,
      name: placeholderName,
      type: 'static',
      value: isDynamic ? `[${path}]` : `{{${path}}}`,
      scope,
      updatedAt: 0,
    });
    return `{{${placeholderName}}}`;
  });

  const rendered = await resolveMessageTemplate(
    maskedTemplate,
    previewVariables,
    { iteration: 1, messageIndex: 1, timestamp: new Date(0) },
    scope,
  );
  return { text: rendered.text, variablesUsed, unknownVariables };
}
