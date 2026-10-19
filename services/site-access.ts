import { contentScriptIdForOrigin } from '../lib/content-script-id';

export type SiteAccessResult =
  | { granted: false; origin: string }
  | { granted: true; origin: string; pageScriptInjected: boolean };

/**
 * Request access to the active site's origin and register the extension content
 * script only after permission is granted. UI messages stay in the React layer.
 */
export async function ensureSiteAccessForTab(tab: Browser.tabs.Tab): Promise<SiteAccessResult> {
  if (!tab.id || !tab.url) return { granted: false, origin: '' };
  const origin = new URL(tab.url).origin;
  const pattern = origin + '/*';
  const granted = await browser.permissions.contains({ origins: [pattern] })
    || await browser.permissions.request({ origins: [pattern] });
  if (!granted) return { granted: false, origin };

  const id = contentScriptIdForOrigin(origin);
  const legacyId = 'chat-automation-' + origin.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (legacyId !== id) {
    const legacy = await browser.scripting.getRegisteredContentScripts({ ids: [legacyId] });
    if (legacy.some(script => script.matches?.includes(pattern))) {
      await browser.scripting.unregisterContentScripts({ ids: [legacyId] });
    }
  }

  const registered = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (registered.length === 0) {
    await browser.scripting.registerContentScripts([{
      id,
      matches: [pattern],
      js: ['/content-scripts/content.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    }]);
  }

  try {
    const response = await browser.tabs.sendMessage(tab.id, { type: 'CHAT_AUTOMATION_PING' });
    if (response?.ready === true) return { granted: true, origin, pageScriptInjected: false };
  } catch {
    // Existing tabs do not receive a newly registered script until navigation.
  }

  await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/content.js'] });
  return { granted: true, origin, pageScriptInjected: true };
}
