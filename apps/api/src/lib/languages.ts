export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', gu: 'Gujarati', bn: 'Bengali',
};

export function normalizeLanguage(value: unknown): string {
  return typeof value === 'string' && Object.hasOwn(LANGUAGE_NAMES, value) ? value : 'en';
}

/** How a caption should be written. English keeps today's Hinglish-first style. */
export function captionLanguage(code: string): string {
  return code === 'en' ? 'Hinglish (conversational mix of Hindi and English)' : `${LANGUAGE_NAMES[code] ?? 'English'} in its native script`;
}

/** Descriptions of the three caption options in the elaborate-prompt schema. */
export function briefCaptionInstructions(code: string): [string, string, string] {
  if (code === 'en') {
    return [
      'Primary Option 1: engaging Hinglish (conversational mix of Hindi and English) social media post caption.',
      'Option 2: professional English social media post caption.',
      'Option 3: bold, high-energy marketing social media post caption.',
    ];
  }
  const name = LANGUAGE_NAMES[code] ?? 'English';
  return [
    `Primary Option 1: engaging social media post caption written in ${name} (native script).`,
    `Option 2: professional social media post caption written in ${name} (native script).`,
    `Option 3: bold, high-energy marketing caption written in ${name} (native script).`,
  ];
}
