import { prisma } from '../db/prisma.js';
import { openSecret } from './secretBox.js';

export const GEMINI_PROVIDER = 'google-gemini';
const CACHE_MS = 60_000;

export type GeminiKeySource = 'saved' | 'env' | 'none';

export interface ResolvedGeminiKey {
  key: string | null;
  source: GeminiKeySource;
  connectionId: string | null;
}

let cached: { value: ResolvedGeminiKey; at: number } | null = null;

// The saved key of the earliest enabled Gemini connection that has one, else the server's
// GEMINI_API_KEY. Cached for a minute per instance; key or connection changes invalidate it.
export async function resolveGeminiKey(): Promise<ResolvedGeminiKey> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = await lookup();
  cached = { value, at: Date.now() };
  return value;
}

async function lookup(): Promise<ResolvedGeminiKey> {
  try {
    const connections = await prisma.apiConnection.findMany({
      where: { provider: GEMINI_PROVIDER, enabled: true, has_key: true },
      orderBy: { created_at: 'asc' },
    });
    for (const connection of connections) {
      const secret = await prisma.apiConnectionSecret.findFirst({ where: { connection_id: connection.id } });
      if (secret) return { key: openSecret(secret), source: 'saved', connectionId: connection.id };
    }
  } catch (err) {
    // Generation must keep working if the saved key can't be read (store outage, key rotation):
    // fall back to the server key and say so in the logs.
    console.error('[aiKeys] Could not read the saved Gemini key; falling back to GEMINI_API_KEY', err);
  }
  const envKey = process.env['GEMINI_API_KEY']?.trim();
  return envKey
    ? { key: envKey, source: 'env', connectionId: null }
    : { key: null, source: 'none', connectionId: null };
}

export async function getGeminiApiKey(): Promise<string | null> {
  return (await resolveGeminiKey()).key;
}

export async function hasGeminiKey(): Promise<boolean> {
  return (await resolveGeminiKey()).key !== null;
}

export function invalidateAiKeyCache(): void {
  cached = null;
}
