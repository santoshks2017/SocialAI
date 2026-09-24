import type { Dealer, InboxMessage } from '../generated/client/index.js';
import { generateInboxReply as groqInboxReply, isGroqAvailable } from '../services/groq.js';
import { generateInboxReply as openaiInboxReply, generateTestimonialCaption, type DealerContext } from '../services/openai.js';
import { geminiJson } from './geminiJson.js';

export type ReplyTone = 'positive' | 'recovery' | 'neutral';

export function toneFor(sentiment: string | null | undefined): ReplyTone {
  if (sentiment === 'positive') return 'positive';
  if (sentiment === 'negative') return 'recovery';
  return 'neutral';
}

const TONE_GUIDE: Record<ReplyTone, string> = {
  positive: 'Warm and grateful: thank them by first name and invite them back.',
  recovery: 'Apologetic and calm: acknowledge the problem, never argue, and offer a call-back from the manager.',
  neutral: 'Helpful and friendly: answer what they asked and invite them to visit or call.',
};

/** Comments are public and short; DMs and emails are private messages. */
export function inboxReplyType(value: string): 'comment' | 'dm' | 'review' {
  const lower = value.toLowerCase();
  if (lower === 'review' || lower === 'reviews') return 'review';
  if (lower === 'dm' || lower === 'message' || lower === 'messaging' || lower === 'email') return 'dm';
  return 'comment';
}

type DealerFields = Pick<Dealer, 'name' | 'city' | 'brands' | 'phone' | 'contact_phone' | 'whatsapp_number' | 'language_preferences'>;

export function dealerReplyContext(dealer: DealerFields): DealerContext {
  return {
    name: dealer.name,
    city: dealer.city,
    brands: Array.isArray(dealer.brands) ? (dealer.brands as unknown[]).filter((b): b is string => typeof b === 'string') : [],
    phone: dealer.contact_phone ?? dealer.phone,
    whatsapp: dealer.whatsapp_number ?? dealer.phone,
    language_preferences: dealer.language_preferences ?? [],
  };
}

export interface SuggestRepliesInput {
  message: Pick<InboxMessage, 'message_text' | 'message_type' | 'customer_name' | 'sentiment' | 'rating'>;
  dealer: DealerContext;
  /** A tone the user asked for; otherwise it follows the message's sentiment. */
  tone?: string | undefined;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const openAiConfigured = () => !!process.env['OPENAI_API_KEY']?.trim();

function repliesPrompt({ message, dealer, tone }: SuggestRepliesInput): string {
  const type = inboxReplyType(message.message_type);
  const rating = message.rating ? ` (${message.rating}★ review)` : '';
  return [
    `You write replies for ${dealer.name}, a car dealership in ${dealer.city}, India.`,
    `Customer ${type} from ${message.customer_name}${rating}:`,
    `"""${message.message_text}"""`,
    'Write 3 different reply options.',
    `- ${tone ? `Use a ${tone} tone.` : TONE_GUIDE[toneFor(message.sentiment)]}`,
    "- Reply in the customer's language and script (English, Hindi or Hinglish).",
    `- At most ${type === 'comment' ? 60 : 120} words each.${type === 'comment' ? ' It is a public comment, so keep it short.' : ''}`,
    `- When useful, invite them to call ${dealer.phone} or WhatsApp ${dealer.whatsapp}.`,
    '- Never promise prices, discounts or delivery dates.',
    'Return JSON only: {"replies": ["…", "…", "…"]}',
  ].join('\n');
}

/** Reply options from a model answer: a { replies: [] } object or a bare array. At most three, trimmed. */
export function parseReplies(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? (value as { replies?: unknown }).replies : null;
  if (!Array.isArray(list)) return [];
  return list.filter((r): r is string => typeof r === 'string').map((r) => r.trim()).filter(Boolean).slice(0, 3);
}

/**
 * Up to three reply options: Gemini first (one JSON call), then Groq or OpenAI (one option).
 * Returns null when no AI provider is configured; throws when every configured provider failed.
 */
export async function suggestReplies(input: SuggestRepliesInput): Promise<string[] | null> {
  const failures: string[] = [];
  try {
    const answer = await geminiJson(repliesPrompt(input));
    if (answer) {
      const replies = parseReplies(answer.value);
      if (replies.length > 0) return replies;
      failures.push('Gemini returned no replies');
    }
  } catch (err) {
    failures.push(errorText(err));
  }

  const type = inboxReplyType(input.message.message_type);
  const sentiment = input.message.sentiment ?? 'neutral';
  const tone = input.tone ?? toneFor(input.message.sentiment);
  if (isGroqAvailable()) {
    try {
      const reply = (await groqInboxReply(input.message.message_text, sentiment, input.dealer, type, tone)).trim();
      if (reply) return [reply];
      failures.push('Groq returned no reply');
    } catch (err) {
      failures.push(`Groq: ${errorText(err)}`);
    }
  }
  if (openAiConfigured()) {
    try {
      const reply = (await openaiInboxReply(input.message.message_text, sentiment, input.dealer, type, undefined, tone)).trim();
      if (reply) return [reply];
      failures.push('OpenAI returned no reply');
    } catch (err) {
      failures.push(`OpenAI: ${errorText(err)}`);
    }
  }
  if (failures.length === 0) return null;
  throw new Error(`No reply suggestions: ${failures.join('; ')}`);
}

/** A caption and #-prefixed hashtags (at most 10) from a model answer, or null. */
export function parseTestimonial(value: unknown): { caption: string; hashtags: string[] } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { caption, hashtags } = value as { caption?: unknown; hashtags?: unknown };
  if (typeof caption !== 'string' || !caption.trim()) return null;
  const tags = Array.isArray(hashtags) ? hashtags.filter((h): h is string => typeof h === 'string') : [];
  return {
    caption: caption.trim(),
    hashtags: tags.map((t) => t.trim().replace(/^#+/, '')).filter(Boolean).map((t) => `#${t}`).slice(0, 10),
  };
}

/**
 * A thank-you post caption from a customer review ("Turn into post"): Gemini first, then OpenAI.
 * Returns null when no AI provider is configured; throws when every configured provider failed.
 */
export async function draftTestimonial(input: {
  reviewText: string;
  customerName: string;
  rating: number | null;
  dealer: { name: string; city: string };
}): Promise<{ caption: string; hashtags: string[] } | null> {
  const failures: string[] = [];
  try {
    const answer = await geminiJson([
      `Write a social media post for ${input.dealer.name}, a car dealership in ${input.dealer.city}, India, thanking a customer for their review.`,
      `Review by ${input.customerName}${input.rating ? ` (${input.rating}★)` : ''}:`,
      `"""${input.reviewText}"""`,
      'Keep it under 100 words, warm and specific to what they said. Use their first name only.',
      'Return JSON only: {"caption": "…", "hashtags": ["#HappyCustomer", "…"]} with 3 to 6 hashtags.',
    ].join('\n'));
    if (answer) {
      const draft = parseTestimonial(answer.value);
      if (draft) return draft;
      failures.push('Gemini returned no caption');
    }
  } catch (err) {
    failures.push(errorText(err));
  }
  if (openAiConfigured()) {
    try {
      const draft = parseTestimonial(await generateTestimonialCaption(input.reviewText, input.customerName, input.dealer));
      if (draft) return draft;
      failures.push('OpenAI returned no caption');
    } catch (err) {
      failures.push(`OpenAI: ${errorText(err)}`);
    }
  }
  if (failures.length === 0) return null;
  throw new Error(`No testimonial draft: ${failures.join('; ')}`);
}
