// Google AI (Gemini API) request helpers. The key travels in the x-goog-api-key header only —
// never in a URL, where it would end up in logs and error objects.
export const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function googleAiHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
}

export function generateContentUrl(model: string): string {
  return `${GOOGLE_AI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
}
