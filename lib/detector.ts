import type { Candidate } from './contracts';

const SELECTORS = [
  'textarea',
  'input:not([type]), input[type="text"], input[type="search"]',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[aria-multiline="true"]',
].join(',');

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
}

function describe(element: HTMLElement): string {
  return [element.getAttribute('placeholder'), element.getAttribute('aria-label'), element.getAttribute('name'), element.getAttribute('data-placeholder'), element.getAttribute('title')].filter(Boolean).join(' ').toLowerCase();
}

export function detectCandidates(root: ParentNode = document): Candidate[] {
  const candidates: Candidate[] = [];
  for (const node of root.querySelectorAll<HTMLElement>(SELECTORS)) {
    if (!isVisible(node) || node.matches(':disabled, [aria-disabled="true"], [readonly]')) continue;
    const reasons: string[] = [];
    let score = 0;
    const text = describe(node);
    if (node instanceof HTMLTextAreaElement) { score += 25; reasons.push('textarea'); }
    if (node.isContentEditable || node.getAttribute('contenteditable') === 'true') { score += 25; reasons.push('contenteditable'); }
    if (node.getAttribute('role') === 'textbox') { score += 18; reasons.push('role=textbox'); }
    if (node.getAttribute('aria-multiline') === 'true') { score += 10; reasons.push('aria-multiline'); }
    if (/message|chat|prompt|reply|ask|send a message|écri|message/i.test(text)) { score += 30; reasons.push('chat-related attributes'); }
    if (node.closest('form')) { score += 8; reasons.push('inside form'); }
    if (node.getAttribute('aria-label')) { score += 4; reasons.push('aria-label'); }
    candidates.push({ element: node, score, reasons });
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export function stableSelector(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  for (const attribute of ['data-testid', 'data-test', 'aria-label', 'name', 'placeholder', 'id']) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const escaped = CSS.escape(value);
    const selector = attribute === 'id' ? `#${escaped}` : `${tag}[${attribute}="${escaped}"]`;
    try { if (document.querySelectorAll(selector).length === 1) return selector; } catch { /* continue with a safer fallback */ }
  }
  const role = element.getAttribute('role');
  if (role) {
    const selector = `${tag}[role="${CSS.escape(role)}"]`;
    try { if (document.querySelectorAll(selector).length === 1) return selector; } catch { /* continue with a structural selector */ }
  }

  // A bare tag such as "textarea" is not a reliable fallback: chat sites often
  // keep hidden composers or other textareas in the DOM, so querySelector() can
  // resolve a different element from the one selected during strategy validation.
  // Build a DOM path with nth-of-type segments and accept it only if it resolves
  // uniquely to the exact selected element.
  const segments: string[] = [];
  let current: HTMLElement | null = element;
  while (current) {
    const currentTag = current.tagName.toLowerCase();
    const parent: HTMLElement | null = current.parentElement;
    let segment = currentTag;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        sibling => sibling.tagName.toLowerCase() === currentTag,
      );
      if (sameTagSiblings.length > 1) {
        segment += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }
    segments.unshift(segment);
    const selector = segments.join(' > ');
    try {
      const matches = document.querySelectorAll(selector);
      if (matches.length === 1 && matches[0] === element) return selector;
    } catch { /* keep climbing until a valid unique path is found */ }
    current = parent;
  }

  // The document path should normally be unique. Fail closed rather than
  // persist a selector that could silently target another input.
  throw new Error('Unable to create a unique selector for the selected chat input.');
}

export function findSendButton(input: HTMLElement): HTMLElement | undefined {
  const form = input.closest('form');
  const scope: ParentNode = form ?? input.parentElement?.parentElement ?? document;
  const buttons = [...scope.querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"]')].filter(isVisible);
  const scored = buttons.map((button) => {
    const label = [button.innerText, button.getAttribute('aria-label'), button.getAttribute('title'), button.getAttribute('data-testid'), button.getAttribute('type')].filter(Boolean).join(' ').toLowerCase();
    let score = 0;
    if (/send|submit|envoyer|envoyer le message|submit message/i.test(label)) score += 50;
    if (button.getAttribute('type') === 'submit') score += 20;
    if (button.closest('form') && button.closest('form') === form) score += 15;
    if (button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true') score -= 100;
    return { button, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score && scored[0].score >= 20 ? scored[0].button : undefined;
}
