import { prisma } from '../db/prisma.js';
import { geminiJson } from './geminiJson.js';

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type InboxTag = 'lead' | 'complaint' | 'general' | 'spam';
export interface Classification { sentiment: Sentiment; tag: InboxTag }

export const CLASSIFY_BATCH = 20;
const SENTIMENTS: readonly string[] = ['positive', 'neutral', 'negative'];
const TAGS: readonly string[] = ['lead', 'complaint', 'general', 'spam'];

/** Reviews carry their own verdict: 4–5★ positive, 3★ neutral, 1–2★ negative and a complaint. */
export function classifyFromRating(rating: number): Classification {
  if (rating >= 4) return { sentiment: 'positive', tag: 'general' };
  if (rating === 3) return { sentiment: 'neutral', tag: 'general' };
  return { sentiment: 'negative', tag: 'complaint' };
}

// English, Hinglish and a few Hindi words seen in dealership comments and DMs.
const COMPLAINT_WORDS = [
  'bad', 'worst', 'poor', 'problem', 'issue', 'delay', 'delayed', 'late', 'rude', 'refund', 'complaint', 'complain',
  'pathetic', 'disappointed', 'not happy', 'never again', 'cheated', 'fraud', 'bekaar', 'bakwas', 'ghatiya', 'kharab', 'dhoka',
  'बेकार', 'खराब',
];
const SPAM_WORDS = ['lottery', 'prize', 'gift card', 'free followers', 'click this link', 'crypto', 'bitcoin', 'earn money'];
const LEAD_WORDS = [
  'price', 'pricing', 'quote', 'quotation', 'on-road', 'on road', 'finance', 'loan', 'emi', 'test drive', 'book', 'booking',
  'offer', 'offers', 'discount', 'exchange', 'interested', 'available', 'kitna', 'kitne', 'kimat', 'keemat', 'daam', 'कीमत',
];
const POSITIVE_WORDS = [
  'great', 'thanks', 'thank you', 'thank u', 'excellent', 'love', 'loved', 'best', 'awesome', 'amazing', 'happy', 'satisfied',
  'wonderful', 'superb', 'badhiya', 'shukriya', 'dhanyavad', 'mast', 'zabardast', 'धन्यवाद', 'शुक्रिया',
];

const escapeRegExp = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole words only, in any script: "premium" does not mention "emi".
function mentions(text: string, words: readonly string[]): boolean {
  return words.some((w) => new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${escapeRegExp(w)}(?=$|[^\\p{L}\\p{M}\\p{N}])`, 'iu').test(text));
}

/** Keyword fallback when there is no Gemini key or the AI call failed. */
export function classifyHeuristic(text: string): Classification {
  if (mentions(text, COMPLAINT_WORDS)) return { sentiment: 'negative', tag: 'complaint' };
  if (mentions(text, SPAM_WORDS)) return { sentiment: 'neutral', tag: 'spam' };
  const sentiment: Sentiment = mentions(text, POSITIVE_WORDS) ? 'positive' : 'neutral';
  return { sentiment, tag: mentions(text, LEAD_WORDS) ? 'lead' : 'general' };
}

/** The model's verdicts by message id. Anything malformed is left out, so the caller falls back to keywords. */
export function parseAiClassifications(value: unknown): Map<string, Classification> {
  const out = new Map<string, Classification>();
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? (value as { items?: unknown }).items : null;
  if (!Array.isArray(list)) return out;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const { id, sentiment, tag } = entry as { id?: unknown; sentiment?: unknown; tag?: unknown };
    if (typeof id !== 'string' || typeof sentiment !== 'string' || typeof tag !== 'string') continue;
    if (!SENTIMENTS.includes(sentiment) || !TAGS.includes(tag)) continue;
    out.set(id, { sentiment: sentiment as Sentiment, tag: tag as InboxTag });
  }
  return out;
}

// Each model gets 8 s, so the cron's time-box bounds the work instead of leaving the call running.
const CLASSIFY_TIMEOUT_MS = 8_000;

/** One Gemini JSON call for a batch. Null when no key is configured; throws when the call failed. */
export async function classifyWithAi(items: Array<{ id: string; text: string; type: string }>): Promise<Map<string, Classification> | null> {
  const answer = await geminiJson([
    'Classify each customer message sent to an Indian car dealership (English, Hindi or Hinglish).',
    'sentiment: positive | neutral | negative.',
    'tag: lead (asks about price, EMI, finance, a test drive, booking, offers or availability) | complaint (unhappy with service, delivery, staff or the car) | spam (ads, scams, unrelated links) | general (anything else).',
    'Return JSON only: an array of {"id": "…", "sentiment": "…", "tag": "…"} with one entry per message.',
    `Messages: ${JSON.stringify(items.map((i) => ({ id: i.id, type: i.type, text: i.text.slice(0, 500) })))}`,
  ].join('\n'), { timeoutMs: CLASSIFY_TIMEOUT_MS });
  return answer ? parseAiClassifications(answer.value) : null;
}

/**
 * Cron step: sentiment and tag for up to `limit` new messages (flagged needs_classification at ingestion), oldest first.
 * Rated reviews use their stars; the rest go to Gemini in one call, with keywords as the fallback.
 * Never overwrites a sentiment or tag that is already set. Returns how many messages it classified.
 */
export async function classifyPendingMessages(limit = CLASSIFY_BATCH): Promise<number> {
  const pending = (await prisma.inboxMessage.findMany({ where: { needs_classification: true } }))
    .sort((a, b) => a.received_at.getTime() - b.received_at.getTime())
    .slice(0, limit);
  if (pending.length === 0) return 0;

  const verdicts = new Map<string, Classification>();
  const forAi: Array<{ id: string; text: string; type: string }> = [];
  for (const m of pending) {
    if (m.rating) verdicts.set(m.id, classifyFromRating(m.rating));
    else if (m.message_text.trim()) forAi.push({ id: m.id, text: m.message_text, type: m.message_type });
    else verdicts.set(m.id, { sentiment: 'neutral', tag: 'general' });
  }
  if (forAi.length > 0) {
    let ai: Map<string, Classification> | null = null;
    try {
      ai = await classifyWithAi(forAi);
    } catch (err) {
      console.error('[inbox] AI classification failed; using keywords:', err instanceof Error ? err.message : String(err));
    }
    for (const item of forAi) verdicts.set(item.id, ai?.get(item.id) ?? classifyHeuristic(item.text));
  }

  let classified = 0;
  for (const m of pending) {
    const verdict: Classification = verdicts.get(m.id) ?? { sentiment: 'neutral', tag: 'general' };
    try {
      await prisma.inboxMessage.update({
        where: { id: m.id },
        data: {
          needs_classification: false,
          ...(m.sentiment ? {} : { sentiment: verdict.sentiment }),
          ...(m.tag ? {} : { tag: verdict.tag }),
        },
      });
      classified++;
    } catch (err) {
      console.error(`[inbox] Could not save the classification of message ${m.id}:`, err instanceof Error ? err.message : String(err));
    }
  }
  return classified;
}
