import OpenAI from 'openai';
import type { DealerContext, InventoryContext, GeneratedCaptions, CaptionVariant } from './openai.js';
import { buildEnrichedSystemPrompt } from '../data/indianAutoPatterns.js';

export type { DealerContext, InventoryContext, GeneratedCaptions, CaptionVariant };

// Groq is OpenAI-compatible — same SDK, different base URL + model
let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env['GROQ_API_KEY'];
    if (!apiKey) throw new Error('GROQ_API_KEY is not set');
    client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return client;
}

const GROQ_MODEL = process.env['GROQ_MODEL'] ?? 'llama-3.3-70b-versatile';

export async function generateCaptions(
  prompt: string,
  dealer: DealerContext,
  inventory?: InventoryContext,
  inspirationPosts?: string[],
  postType?: string,
  includeHindi = false,
): Promise<GeneratedCaptions> {
  const groq = getClient();

  const systemPrompt = buildEnrichedSystemPrompt(dealer.city, dealer.brands ?? [], postType, includeHindi);

  const vehicleBlock = inventory
    ? `VEHICLE: ${inventory.make ?? ''} ${inventory.model ?? ''} ${inventory.variant ?? ''} | Price: ${inventory.price ? `₹${(inventory.price / 100000).toFixed(2)} Lakhs` : 'not provided — omit pricing'} | Stock: ${inventory.stock_count ?? 'available'}`
    : 'VEHICLE: Use prompt details only.';

  const inspirationBlock = inspirationPosts && inspirationPosts.length > 0
    ? `\n\nINSPIRATION POSTS (real posts from similar Indian auto dealers — match the energy and style, do NOT copy):\n${inspirationPosts.slice(0, 6).map((p, i) => `${i + 1}. "${p}"`).join('\n')}`
    : '';

  const userMessage = `DEALER: ${dealer.name}, ${dealer.city} | Phone: ${dealer.phone} | WhatsApp: ${dealer.whatsapp} | Brands: ${(dealer.brands ?? []).join(', ')}
${vehicleBlock}
POST REQUEST: "${prompt}"${inspirationBlock}

Generate 3 caption variants as JSON.${includeHindi ? ' Include hindi_variants.' : ''}`;

  const response = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.85,
    max_tokens: includeHindi ? 2600 : 1800,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from Groq');

  const parsed = JSON.parse(content) as { variants?: unknown[]; hindi_variants?: unknown[] };
  if (!Array.isArray(parsed.variants) || parsed.variants.length < 1) {
    throw new Error('Invalid caption structure from Groq');
  }

  const styles: Array<'punchy' | 'detailed' | 'emotional'> = ['punchy', 'detailed', 'emotional'];
  const variants = parsed.variants.slice(0, 3).map((v: unknown, i: number) => {
    const obj = v as Record<string, unknown>;
    return {
      caption_text: String(obj['caption_text'] ?? ''),
      hashtags: Array.isArray(obj['hashtags']) ? (obj['hashtags'] as string[]) : [],
      suggested_emoji: Array.isArray(obj['suggested_emoji']) ? (obj['suggested_emoji'] as string[]) : [],
      platform_notes: String(obj['platform_notes'] ?? ''),
      style: styles[i] ?? 'punchy',
    } satisfies CaptionVariant;
  });

  while (variants.length < 3) variants.push({ ...variants[0]!, style: styles[variants.length] ?? 'punchy' });

  let hindi_variants: [string, string, string] | undefined;
  if (includeHindi && Array.isArray(parsed.hindi_variants) && parsed.hindi_variants.length >= 3) {
    hindi_variants = [
      String(parsed.hindi_variants[0] ?? ''),
      String(parsed.hindi_variants[1] ?? ''),
      String(parsed.hindi_variants[2] ?? ''),
    ];
  }

  return {
    variants: variants as [CaptionVariant, CaptionVariant, CaptionVariant],
    ...(hindi_variants ? { hindi_variants } : {}),
  };
}

export async function generateInboxReply(
  messageText: string,
  sentiment: string,
  dealer: DealerContext,
  messageType: 'comment' | 'dm' | 'review',
  tone?: string,
): Promise<string> {
  const groq = getClient();
  const maxWords = messageType === 'comment' ? 80 : 180;

  const response = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a customer service assistant for ${dealer.name} in ${dealer.city}. Be polite and professional. Always include CTA: call ${dealer.phone} or WhatsApp ${dealer.whatsapp}. Under ${maxWords} words. SENTIMENT: ${sentiment}.${tone ? ` TONE OF RESPONSE: Use a strictly ${tone} tone.` : ''} Return JSON: {"reply":"..."}`,
      },
      { role: 'user', content: `Customer ${messageType}: "${messageText}"` },
    ],
    temperature: 0.6,
    max_tokens: 300,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content ?? '';
  try {
    const parsed = JSON.parse(content) as { reply?: string };
    return parsed.reply?.trim() ?? content.trim();
  } catch {
    return content.trim();
  }
}

export async function transformCaption(caption: string, instruction: string): Promise<string> {
  const groq = getClient();
  const response = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a social media copywriter for Indian automobile dealerships. Apply the given transformation to the caption and return ONLY the transformed text, no explanation, no markdown, no quotes.',
      },
      { role: 'user', content: `CAPTION:\n${caption}\n\nTRANSFORMATION: ${instruction}` },
    ],
    temperature: 0.7,
    max_tokens: 600,
  });
  return response.choices[0]?.message?.content?.trim() ?? caption;
}

export function isGroqAvailable(): boolean {
  return !!(process.env['GROQ_API_KEY']);
}
