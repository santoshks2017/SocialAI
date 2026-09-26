// The one connect flow for Accounts, Onboarding and Settings: ask the API for the provider's consent URL,
// remember where to come back to, then leave the app (a full-page redirect, never a popup).
// /oauth/callback (pages/OAuthCallbackPage.tsx) shows the outcome and returns to that page.

export type OAuthReturnPath = '/accounts' | '/onboarding' | '/settings?tab=platforms';
export type ConnectPlatform = 'facebook' | 'gmb' | 'youtube';

export const OAUTH_RETURN_KEY = 'oauth_return_to';

const RETURN_PATHS: readonly OAuthReturnPath[] = ['/accounts', '/onboarding', '/settings?tab=platforms'];

/** Only the in-app return paths; anything else (another site, a typo) goes to Accounts. */
export function parseOAuthReturn(value: string | null | undefined): OAuthReturnPath {
  return RETURN_PATHS.find((path) => path === value) ?? '/accounts';
}

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null; // blocked (privacy settings, sandboxed frames)
  }
}

/** Where to go after a connect; reading clears it. */
export function readOAuthReturn(): OAuthReturnPath {
  const store = storage();
  let value: string | null = null;
  try {
    value = store?.getItem(OAUTH_RETURN_KEY) ?? null;
    store?.removeItem(OAUTH_RETURN_KEY);
  } catch {
    value = null;
  }
  return parseOAuthReturn(value);
}

/** Starts a connect: leaves the app on success, throws (for a toast) when the API gives no consent URL. */
export async function startConnect(platform: 'facebook' | 'gmb' | 'youtube', returnTo: OAuthReturnPath): Promise<void> {
  // Loaded on use, so the pure helpers above stay importable by the node test runner.
  const { default: api } = await import('../services/api');
  const res = await api.get<{ redirect_url?: string }>(`/platforms/connect/${platform}`);
  if (!res.redirect_url) throw new Error('The sign-in link did not come back. Please try again.');
  try {
    storage()?.setItem(OAUTH_RETURN_KEY, returnTo);
  } catch {
    // Storage blocked: the return lands on Accounts.
  }
  window.location.href = res.redirect_url;
}

export interface OAuthToast {
  type: 'success' | 'error';
  title: string;
  message: string;
}

// The reference's error codes; our API mostly sends a sentence, shown as it is.
const OAUTH_ERRORS: Record<string, string> = {
  server_config: 'OAuth is not configured on the server. Contact support.',
  token_exchange_failed: 'Token exchange failed. Please try again.',
  no_code: 'Authorization was cancelled.',
  no_locations: 'No Google Business locations found on this account. Make sure you have a verified Business Profile, then try again.',
  gbp_quota: 'Google Business Profile access is not yet approved for this app (zero API quota). The developer must request Business Profile API access from Google.',
  gbp_disabled: 'The Google Business Profile APIs are not enabled for this app. The developer must enable them in Google Cloud Console.',
  gbp_error: 'Could not read your Google Business Profile. Please try again, or contact support if it persists.',
  access_denied: 'Access was denied. Please try again and accept the permissions.',
};

const LINKED_PARTS: ReadonlyArray<readonly [string, string]> = [
  ['fb', 'Facebook page(s)'],
  ['ig', 'Instagram account(s)'],
  ['google', 'Google Business location(s)'],
  ['youtube', 'YouTube channel(s)'],
];

/** The toast for an OAuth return query; null when the query reports nothing. */
export function oauthToast(params: URLSearchParams): OAuthToast | null {
  const error = params.get('error');
  if (error) {
    const message = OAUTH_ERRORS[error] ?? (/\s/.test(error) ? error : `OAuth error: ${error}`);
    return { type: 'error', title: 'Connection failed', message };
  }
  const success = params.get('success');
  if (success !== '1' && success !== 'true') return null;
  const parts = LINKED_PARTS.flatMap(([key, label]) => {
    const count = params.get(key);
    return count && count !== '0' ? [`${count} ${label}`] : [];
  });
  return { type: 'success', title: 'Connected!', message: parts.length > 0 ? `Linked: ${parts.join(', ')}` : 'Account connected successfully.' };
}
