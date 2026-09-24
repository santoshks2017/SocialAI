import { prisma } from '../db/prisma.js';
import { disconnectRevokedConnection } from './connectionStore.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const REFRESH_TIMEOUT_MS = 15_000;

export interface GoogleTokenConnection {
  id: string;
  /** 'gmb' or 'youtube': picks the wording of the reconnect message. */
  platform?: string;
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: Date | string | null;
}

function wording(platform: string | undefined): { label: string; hint: string } {
  return platform === 'youtube'
    ? { label: 'YouTube', hint: 'Reconnect YouTube on Accounts, then publish again.' }
    : { label: 'Google Business Profile', hint: 'Reconnect Google Business Profile in Settings, then publish again.' };
}

export function googleTokenNeedsRefresh(expiresAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isNaN(expiresMs) || expiresMs - now <= REFRESH_MARGIN_MS;
}

// Google access tokens last ~1h. Refreshes with the stored refresh token when the current one is missing an
// expiry, expired, or about to expire, and persists the new token. When Google says the grant is gone
// (invalid_grant), the account is disconnected and the team told (lib/connectionStore.ts).
export async function getFreshGoogleAccessToken(conn: GoogleTokenConnection): Promise<string> {
  if (!googleTokenNeedsRefresh(conn.token_expires_at)) return conn.access_token;
  const { label, hint } = wording(conn.platform);

  if (!conn.refresh_token) {
    throw new Error(`${label} access expired and cannot be renewed. ${hint}`);
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
    signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    if (body.error === 'invalid_grant') {
      await disconnectRevokedConnection(conn.id).catch((err: unknown) => {
        console.error('[google-token] Could not record the revoked connection:', err instanceof Error ? err.message : String(err));
      });
    }
    const reason = body.error_description ?? body.error ?? `HTTP ${res.status}`;
    throw new Error(`Could not renew ${label} access (${reason}). ${hint}`);
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
