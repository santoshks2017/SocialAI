import axios from 'axios';
import { getGeminiApiKey } from './aiKeys.js';
import { resolveAiModels } from './aiModels.js';
import { generateContentUrl, googleAiHeaders } from './googleAi.js';

/** Parses a model's JSON answer, tolerating ```json fences around it. Throws on invalid JSON. */
export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

/**
 * One JSON-mode call to the chosen Gemini text model, then its fallbacks (resolveAiModels).
 * The key travels in the x-goog-api-key header only.
 * Returns null when no Gemini key is configured; throws (with a message, no key) when every model failed.
 */
export async function geminiJson(prompt: string, options: { timeoutMs?: number } = {}): Promise<{ value: unknown } | null> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) return null;
  const models = await resolveAiModels();
  let lastError = 'no model answered';
  for (const model of [models.text, ...models.textFallbacks]) {
    try {
      const res = await axios.post(
        generateContentUrl(model),
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } },
        { headers: googleAiHeaders(apiKey), timeout: options.timeoutMs ?? 20_000 },
      );
      const text: unknown = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string' || !text.trim()) {
        lastError = `${model} returned no text`;
        continue;
      }
      return { value: parseJsonText(text) };
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  throw new Error(`Gemini JSON request failed (${lastError})`);
}
