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
