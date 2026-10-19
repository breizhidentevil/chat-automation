export function isSenderOriginAllowed(senderTabUrl: unknown, claimedOrigin: unknown): boolean {
  if (typeof senderTabUrl !== 'string' || typeof claimedOrigin !== 'string') return false;

  try {
    const senderUrl = new URL(senderTabUrl);
    const claimedUrl = new URL(claimedOrigin);

    if (!['http:', 'https:'].includes(senderUrl.protocol)) return false;
    if (!['http:', 'https:'].includes(claimedUrl.protocol)) return false;
    if (claimedUrl.origin !== claimedOrigin) return false;

    return senderUrl.origin === claimedOrigin;
  } catch {
    return false;
  }
}
