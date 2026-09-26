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
  // is_connected is set to false by the dealer's own disconnect or remove action, and by a
  // revoked Google/YouTube grant (lib/connectionStore.ts disconnectRevokedConnection, which
  // tells the team with a bell notification instead). Neither belongs in this reconnect banner.
  if (conn.is_connected === false) return false;
  if (!conn.token_expires_at) return false;
  if (new Date(conn.token_expires_at).getTime() > now.getTime()) return false;
  return !(REFRESHABLE_PLATFORMS.has(conn.platform) && conn.refresh_token);
}
