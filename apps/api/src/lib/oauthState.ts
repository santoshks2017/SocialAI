import { randomBytes } from 'crypto';
import type { FastifyInstance } from 'fastify';

// OAuth `state` round-trips through the provider and the browser, so it is signed
// and short-lived. The 'oauth_state' typ keeps a leaked state from ever passing
// as a session token (see isAccessToken in plugins/jwt.ts).

export type OAuthStatePurpose = 'platform_oauth' | 'google_signin' | 'facebook_signin';

const STATE_TTL = '10m';

export function signOAuthState(
  fastify: FastifyInstance,
  purpose: OAuthStatePurpose,
  data: Record<string, unknown> = {},
): string {
  const payload = { ...data, typ: 'oauth_state', purpose, nonce: randomBytes(16).toString('base64url') };
  // The JWT payload type is JwtUser; state tokens deliberately are not.
  return fastify.jwt.sign(payload as never, { expiresIn: STATE_TTL });
}

/** The signed data, or null when the state is missing, forged, expired or minted for another purpose. */
export function verifyOAuthState<T extends Record<string, unknown>>(
  fastify: FastifyInstance,
  state: unknown,
  purpose: OAuthStatePurpose,
): T | null {
  if (typeof state !== 'string' || state.length === 0 || state.length > 2048) return null;
  try {
    const payload = fastify.jwt.verify<Record<string, unknown>>(state);
    return payload['typ'] === 'oauth_state' && payload['purpose'] === purpose ? (payload as T) : null;
  } catch {
    return null;
  }
}
