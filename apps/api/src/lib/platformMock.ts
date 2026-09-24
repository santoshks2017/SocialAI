// Local and demo connections carry ids and tokens that start with "mock_" (see routes/platform.ts),
// and so do their "published" post ids. Nothing may call a real platform API with them.
export function isMockId(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('mock_');
}

export function isMockConnection(conn: { access_token: string; platform_account_id: string }): boolean {
  return isMockId(conn.access_token) || isMockId(conn.platform_account_id);
}
