/** Select and order the messages that are allowed in a history export. */
export function selectHistoryExportMessages<T extends {
  origin: string;
  conversationId: string;
  firstSeenAt: number;
}>(
  messages: T[],
  origin: string,
  conversationId: string,
): T[] {
  const siteMessages = messages.filter(message => message.origin === origin);
  const selectedMessages = conversationId
    ? siteMessages.filter(message => message.conversationId === conversationId)
    : siteMessages;
  return selectedMessages.slice().sort((a, b) => a.firstSeenAt - b.firstSeenAt);
}
