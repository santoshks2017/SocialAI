const MODEL_ID = /^[a-z0-9][a-z0-9.-]{2,79}$/;

export function isModelId(value: string): boolean {
  return MODEL_ID.test(value);
}

export function choiceFromStored(stored: string | null, options: ReadonlyArray<{ id: string }>): { select: string; custom: string } {
  if (!stored) return { select: '', custom: '' };
  return options.some((o) => o.id === stored) ? { select: stored, custom: '' } : { select: 'other', custom: stored };
}

/** null = use the default; 'invalid' = the custom id is malformed. */
export function storedFromChoice(select: string, custom: string): string | null | 'invalid' {
  if (!select) return null;
  if (select !== 'other') return select;
  const id = custom.trim();
  return isModelId(id) ? id : 'invalid';
}

export interface KeyTestSummary {
  ok: boolean;
  detail: string;
  source: 'saved' | 'env';
  models: ReadonlyArray<{ available: boolean }>;
}

/** The toast after testing a key: a warning when the key works but a chosen model isn’t available to it. */
export function keyTestToast(result: KeyTestSummary): { type: 'success' | 'warning' | 'error'; title: string; message: string } {
  const message = result.source === 'env' ? `${result.detail} (Tested the server's GEMINI_API_KEY.)` : result.detail;
  if (!result.ok) return { type: 'error', title: 'Key test failed', message };
  if (result.models.some((m) => !m.available)) return { type: 'warning', title: 'Key works — some models unavailable', message };
  return { type: 'success', title: 'Key works', message };
}
