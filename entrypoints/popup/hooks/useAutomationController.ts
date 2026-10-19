import { useState } from 'react';
import { isValidChatSiteProcedure } from '../../../lib/procedure-validation';
import { buildAutomationStartPayload, validateAutomationConfig } from '../../../lib/automation-config';
import { ensureSiteAccessForTab } from '../../../services/site-access';
import { getSupportedSiteOrigin } from '../../../lib/site-origin';
import type { VariableDefinition } from '../../../lib/variables';
import type { Locale } from '../../../lib/i18n';
import { translate } from '../../../lib/i18n';

type PopupPage = 'automation' | 'variables' | 'history' | 'logs' | 'simulator';
type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;

interface AutomationControllerOptions {
  t: Translate;
  locale: Locale;
  message: string;
  automationMessages: string[];
  interval: string;
  unit: 'seconds' | 'minutes';
  repeatCount: string;
  timeWindowEnabled: boolean;
  startTime: string;
  endTime: string;
  variables: VariableDefinition[];
  persistSettings: () => Promise<boolean>;
  refreshLogs: () => void | Promise<unknown>;
  setStatus: (value: string) => void;
  setPage: (page: PopupPage) => void;
}

export function useAutomationController({
  t, locale, message, automationMessages, interval, unit, repeatCount,
  timeWindowEnabled, startTime, endTime, variables, persistSettings,
  refreshLogs, setStatus, setPage,
}: AutomationControllerOptions) {
  const [strategyReady, setStrategyReady] = useState<boolean | null>(null);
  const [strategyOrigin, setStrategyOrigin] = useState('');
  const [siteAccessStatus, setSiteAccessStatus] = useState('');

  async function activeTab(): Promise<Browser.tabs.Tab> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null || !getSupportedSiteOrigin(tab.url)) throw new Error(t('strategyUnavailable'));
    return tab;
  }

  async function refreshStrategyStatus() {
    try {
      const tab = await activeTab();
      const origin = getSupportedSiteOrigin(tab.url);
      if (!origin) throw new Error(t('strategyUnavailable'));
      setStrategyOrigin(origin);
      const data = await browser.storage.local.get('chatAutomationProcedures');
      const procedures = data.chatAutomationProcedures;
      setStrategyReady(Boolean(
        procedures && typeof procedures === 'object' &&
        isValidChatSiteProcedure((procedures as Record<string, unknown>)[origin], origin),
      ));
    } catch {
      setStrategyOrigin('');
      setStrategyReady(false);
      setStatus(t('openChatTab'));
    }
  }

  async function ensureSiteAccess(tab: Browser.tabs.Tab): Promise<boolean> {
    const result = await ensureSiteAccessForTab(tab);
    if (!result.granted) {
      if (result.origin) setSiteAccessStatus(t('siteAccessDenied', { origin: result.origin }));
      return false;
    }
    setSiteAccessStatus(result.pageScriptInjected
      ? t('siteAccessEnabledScriptLoaded', { origin: result.origin })
      : t('siteAccessEnabled', { origin: result.origin }));
    return true;
  }

  async function enableActiveSite() {
    try {
      const tab = await activeTab();
      await ensureSiteAccess(tab);
    } catch (error) {
      setSiteAccessStatus(error instanceof Error ? error.message : t('siteAccessError'));
    }
  }

  async function validateStrategy() {
    const text = message.trim();
    if (!text) { setStatus(t('testMessageRequired')); return; }
    if (!window.confirm(t('testConfirm'))) return;
    try {
      const tab = await activeTab();
      if (!await ensureSiteAccess(tab)) return;
      setStatus(t('testRunning'));
      const response = await browser.tabs.sendMessage(tab.id!, { type: 'CHAT_AUTOMATION_VALIDATE', text });
      setStatus(typeof response?.message === 'string' ? response.message : t('testInconclusive'));
      await refreshStrategyStatus();
      await refreshLogs();
    } catch (error) {
      setStatus(error instanceof Error && error.message.startsWith('Cette page') ? error.message : t('pageScriptUnavailable'));
    }
  }

  async function startAutomation() {
    const validation = validateAutomationConfig({
      messages: automationMessages, interval, unit, repeatCount,
      timeWindowEnabled, startTime, endTime, variables,
    });
    if (!validation.ok) {
      switch (validation.code) {
        case 'sequenceEmpty': setStatus(t('sequenceEmpty')); return;
        case 'sequenceTooLong': setStatus(t('sequenceTooLong')); return;
        case 'unknownVariables':
          setStatus(t('unknownVariables', {
            number: validation.messageIndex ?? 1,
            names: (validation.names ?? []).map(name => `{{${name}}}`).join(', '),
          }));
          setPage('variables');
          return;
        case 'invalidVariableSyntax': setStatus(t('invalidVariableSyntax', { number: validation.messageIndex ?? 1 })); return;
        case 'invalidInterval': setStatus(t('invalidInterval')); return;
        case 'invalidRepeatCount': setStatus(t('invalidRepeatCount')); return;
        case 'invalidTimeWindow': setStatus(t('invalidTimeWindow')); return;
        case 'invalidSettings': setStatus(t('invalidSettings')); return;
        default: return;
      }
    }

    try {
      const tab = await activeTab();
      if (!await ensureSiteAccess(tab)) return;
      const payload = buildAutomationStartPayload(validation.config);
      if (!await persistSettings()) return;
      const response = await browser.tabs.sendMessage(tab.id!, payload);
      setStatus(typeof response?.message === 'string' ? response.message : t('automationStarted'));
      await refreshLogs();
    } catch (error) {
      setStatus(error instanceof Error && error.message.startsWith(locale === 'fr' ? 'Cette page' : 'This page')
        ? error.message
        : (locale === 'fr' ? 'Le script de page est indisponible. Rechargez la page puis réessayez.' : 'The page script is unavailable. Reload the page and try again.'));
    }
  }

  async function stopAutomation() {
    try {
      const tab = await activeTab();
      const response = await browser.tabs.sendMessage(tab.id!, { type: 'CHAT_AUTOMATION_STOP' });
      setStatus(typeof response?.message === 'string' ? response.message : t('automationStopped'));
      await refreshLogs();
    } catch {
      setStatus(t('pageScriptUnreachable'));
    }
  }

  return {
    strategyReady, strategyOrigin, siteAccessStatus, activeTab, refreshStrategyStatus,
    enableActiveSite, validateStrategy, startAutomation, stopAutomation,
  };
}
