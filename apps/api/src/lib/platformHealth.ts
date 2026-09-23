// Google access tokens last an hour and are refreshed on use (lib/googleToken.ts), so an
// expired Google access token only needs the dealer when there is no refresh token.
const REFRESHABLE_PLATFORMS = new Set(['gmb', 'google', 'youtube']);

export function needsReconnect(
  conn: {
    platform: string;
    is_connected?: boolean | null;
    token_expires_at: Date | string | null;
    refresh_token?: string | null;
  },
  now: Date = new Date(),
): boolean {
  if (conn.is_connected === false) return true;
  if (!conn.token_expires_at) return false;
  if (new Date(conn.token_expires_at).getTime() > now.getTime()) return false;
  return !(REFRESHABLE_PLATFORMS.has(conn.platform) && conn.refresh_token);
}
