/** Convert a value to a deterministic, human-readable JSON export. */
export function serializeJsonExport(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

/** Trigger a browser download and release the temporary object URL. */
export function downloadJsonFile(payload: unknown, filename: string): void {
  let url: string | undefined;
  try {
    const blob = new Blob([serializeJsonExport(payload)], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url!), 1000);
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    throw error;
  }
}
