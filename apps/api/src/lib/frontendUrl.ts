// Single source of truth for the web app's base URL. It is used for OAuth
// redirects (some carry tokens in the query string) and as the OpenRouter
// HTTP-Referer, so it must never fall back to a domain we no longer control.

export const PRODUCTION_FRONTEND_URL = 'https://cardekho-social-ai.web.app';
export const DEV_FRONTEND_URL = 'http://localhost:5173';

type Env = Record<string, string | undefined>;

/**
 * FRONTEND_URL when set (trailing slashes stripped); otherwise the live
 * Firebase Hosting domain in production and the Vite dev server elsewhere.
 */
export function getFrontendUrl(env: Env = process.env): string {
  const configured = env['FRONTEND_URL']?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  return env['NODE_ENV'] === 'production' ? PRODUCTION_FRONTEND_URL : DEV_FRONTEND_URL;
}
