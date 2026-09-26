// Approval links are public URLs shaped like /v1/publisher/approval/<token>: the raw token is a
// bearer credential for approving or rejecting a post, so it must never land in request logs.
export function redactApprovalToken(url: string): string {
  return url.replace(/(\/approval\/)[^/?#]+/, '$1[redacted]');
}

// OAuth providers send the browser back to these paths with the authorization `code` and our signed
// `state` in the query: /v1/platforms/callback/<provider> and every /v1/auth/...callback... route.
const OAUTH_CALLBACK_PATH = /^\/v1\/(?:platforms\/callback\/[^?#]*|auth\/[^?#]*callback[^?#]*)$/;
const OAUTH_SECRET_PARAMS = new Set(['code', 'state']);

function paramName(pair: string): string {
  const raw = pair.split('=', 1)[0] ?? '';
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}

/** Replaces the `code` and `state` values on an OAuth callback URL; every other part is kept as sent. */
export function redactOAuthCallbackParams(url: string): string {
  const q = url.indexOf('?');
  if (q === -1 || !OAUTH_CALLBACK_PATH.test(url.slice(0, q))) return url;
  const query = url
    .slice(q + 1)
    .split('&')
    .map((pair) => (OAUTH_SECRET_PARAMS.has(paramName(pair)) ? `${pair.split('=', 1)[0]}=[redacted]` : pair))
    .join('&');
  return `${url.slice(0, q)}?${query}`;
}

/** The request URL as it may appear in logs. */
export function redactRequestUrl(url: string): string {
  return redactOAuthCallbackParams(redactApprovalToken(url));
}
