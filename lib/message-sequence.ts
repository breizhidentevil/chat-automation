/**
 * Pure operations for editing an automation message sequence.
 * The UI owns state; these functions only return the next sequence.
 */

/** Update a message without mutating the input array. */
export function updateMessage(messages: readonly string[], index: number, value: string): string[] {
  if (!Number.isInteger(index) || index < 0 || index >= messages.length) return messages as string[];
  return messages.map((message, messageIndex) => messageIndex === index ? value : message);
}

/** Append an empty message slot. */
export function addMessage(messages: readonly string[]): string[] {
  return [...messages, ""];
}

/** Remove a slot while keeping at least one editable message. */
export function removeMessage(messages: readonly string[], index: number): string[] {
  if (messages.length <= 1) return [""];
  if (!Number.isInteger(index) || index < 0 || index >= messages.length) return messages as string[];
  return messages.filter((_, messageIndex) => messageIndex !== index);
}

/** Move a message to a target index while preserving its contents and relative order. */
export function moveMessage(messages: readonly string[], from: number, to: number): string[] {
  if (
    from === to ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= messages.length ||
    to >= messages.length
  ) return messages as string[];

  const next = [...messages];
  const [item] = next.splice(from, 1);
  if (item === undefined) return messages as string[];
  next.splice(to, 0, item);
  return next;
}
