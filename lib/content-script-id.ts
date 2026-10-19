/** Generate a stable, compact ID without lossy punctuation replacement. */
export function contentScriptIdForOrigin(origin: string): string {
  // FNV-1a keeps the browser scripting API ID short while distinguishing origins
  // that would otherwise collapse to the same sanitized string.
  let hash = 0x811c9dc5;
  for (let index = 0; index < origin.length; index += 1) {
    hash ^= origin.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `chat-automation-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
