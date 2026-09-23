import { prisma } from '../db/prisma.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const RECONNECT_HINT = 'Reconnect Google Business Profile in Settings, then publish again.';

export interface GoogleTokenConnection {
  id: string;
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: Date | string | null;
}

export function googleTokenNeedsRefresh(expiresAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isNaN(expiresMs) || expiresMs - now <= REFRESH_MARGIN_MS;
}

// Google access tokens last ~1h. Refreshes with the stored refresh token when the current
// one is missing an expiry, expired, or about to expire, and persists the new token.
export async function getFreshGoogleAccessToken(conn: GoogleTokenConnection): Promise<string> {
  if (!googleTokenNeedsRefresh(conn.token_expires_at)) return conn.access_token;

  if (!conn.refresh_token) {
    throw new Error(`Google Business Profile access expired and cannot be renewed. ${RECONNECT_HINT}`);
  }
  const clientId = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set to renew Google access');
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    const reason = body.error_description ?? body.error ?? `HTTP ${res.status}`;
    throw new Error(`Could not renew Google Business Profile access (${reason}). ${RECONNECT_HINT}`);
  }

  await prisma.platformConnection.update({
    where: { id: conn.id },
    data: {
      access_token: body.access_token,
      token_expires_at: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
      ...(body.refresh_token ? { refresh_token: body.refresh_token } : {}),
    },
  });
  return body.access_token;
}
