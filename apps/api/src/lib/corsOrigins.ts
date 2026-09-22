/**
 * Origins allowed to make credentialed cross-origin calls to the API.
 *
 * The production web app (and its PR preview channels) calls the API
 * same-origin through the Firebase Hosting `/v1/**` rewrite, so it never
 * needs CORS. Keep this list to exact origins we own — never a wildcard over
 * a shared hosting domain like *.web.app or *.vercel.app, since anyone can
 * deploy a site there.
 */
const ALLOWED_ORIGINS = [
  'https://cardekho-social-ai.web.app',
  'https://cardekho-social-ai.firebaseapp.com',
];

// Local dev: Vite on any port calling the API on :3001
const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function createOriginChecker(frontendUrl?: string): (origin: string) => boolean {
  const allowed = new Set(ALLOWED_ORIGINS);
  if (frontendUrl) allowed.add(frontendUrl);
  return (origin) => allowed.has(origin) || LOCALHOST_ORIGIN.test(origin);
}
