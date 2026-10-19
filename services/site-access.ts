import { getSupportedSiteOrigin } from '../lib/site-origin';

export type SiteAccessResult =
  | { granted: false; origin: string }
  | { granted: true; origin: string; pageScriptInjected: boolean };

/**
 * Ensure the content script is available on the active supported site.
 * Host permissions are granted in the manifest, so this path never prompts.
 */
export async function ensureSiteAccessForTab(tab: Browser.tabs.Tab): Promise<SiteAccessResult> {
  if (tab.id == null) return { granted: false, origin: '' };
  const origin = getSupportedSiteOrigin(tab.url);
  if (!origin) return { granted: false, origin: '' };

  try {
    const response = await browser.tabs.sendMessage(tab.id, { type: 'CHAT_AUTOMATION_PING' });
    if (response?.ready === true) return { granted: true, origin, pageScriptInjected: false };
  } catch {
    // A tab opened before the extension was installed may not have the script yet.
  }

  await browser.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['/content-scripts/content.js'],
  });
  return { granted: true, origin, pageScriptInjected: true };
}
