import axios from 'axios';
import pino from 'pino';

// Axios errors carry the request config (headers, URL, body) and the raw request, so logging one
// would print API keys and tokens. Every error from the shared axios instance is scrubbed before
// callers see it, and the logger scrubs any other error it is handed.

const REDACTED = '[redacted]';
const SECRET_HEADERS = new Set(['authorization', 'x-goog-api-key', 'x-api-key', 'cookie']);
const SECRET_PARAMS = new Set(['key', 'access_token', 'client_secret', 'refresh_token']);

const isSecretHeader = (name: string) => {
  const lower = name.toLowerCase();
  return SECRET_HEADERS.has(lower) || /key|token|secret/.test(lower);
};

const isSecretParam = (name: string) => {
  let decoded = name;
  try { decoded = decodeURIComponent(name); } catch { /* keep the raw name */ }
  return SECRET_PARAMS.has(decoded.toLowerCase());
};

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose => typeof value === 'object' && value !== null;

function redactHeaders(headers: unknown): void {
  if (!isObject(headers)) return;
  for (const name of Object.keys(headers)) {
    if (isSecretHeader(name) && headers[name] != null) headers[name] = REDACTED;
  }
}

/** Drops the secret query params from a URL, keeping the rest of it. */
export function stripSecretParams(url: string): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const hashAt = url.indexOf('#', q);
  const query = url.slice(q + 1, hashAt < 0 ? undefined : hashAt);
  const hash = hashAt < 0 ? '' : url.slice(hashAt);
  const kept = query.split('&').filter((pair) => pair && !isSecretParam(pair.split('=')[0] ?? ''));
  return `${url.slice(0, q)}${kept.length ? `?${kept.join('&')}` : ''}${hash}`;
}

function redactConfig(config: unknown): void {
  if (!isObject(config)) return;
  redactHeaders(config['headers']);
  if (typeof config['url'] === 'string') config['url'] = stripSecretParams(config['url']);
  const params = config['params'];
  if (params instanceof URLSearchParams) {
    config['params'] = new URLSearchParams([...params].filter(([name]) => !isSecretParam(name)));
  } else if (isObject(params)) {
    config['params'] = Object.fromEntries(Object.entries(params).filter(([name]) => !isSecretParam(name)));
  }
  // Request bodies can hold OAuth client secrets, refresh tokens or provider auth keys.
  if (config['data'] != null) config['data'] = REDACTED;
  if (isObject(config['auth'])) config['auth'] = { ...config['auth'], password: REDACTED };
}

/**
 * Scrubs secrets from an axios error in place and returns it: sensitive request headers, secret
 * query params, the request body and basic-auth password, and the raw request (whose `_header`
 * repeats the headers). The message, code and response status/data stay as they were.
 * Anything that isn't an axios-style error is returned untouched.
 */
export function redactError<T>(err: T, depth = 0): T {
  if (!isObject(err) || depth > 3) return err;
  const e = err as Loose;
  if ('config' in e || 'request' in e || 'response' in e) {
    redactConfig(e['config']);
    delete e['request'];
    const response = e['response'];
    if (isObject(response)) {
      redactConfig(response['config']);
      delete response['request'];
    }
  }
  if (e['cause'] !== err) redactError(e['cause'], depth + 1);
  return err;
}

/** Pino `err` serializer: redact, then the standard error serializer. */
export function serializeError(err: Error): pino.SerializedError {
  return pino.stdSerializers.err(redactError(err));
}

let installed = false;

/** Registers the redacting response-error interceptor on the shared axios instance (once). */
export function installHttpErrorRedaction(): void {
  if (installed) return;
  installed = true;
  axios.interceptors.response.use(undefined, (err: unknown) => Promise.reject(redactError(err)));
}
