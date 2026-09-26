import dns from 'dns';
import http from 'http';
import https from 'https';
import { BlockList, isIP, type LookupFunction } from 'net';

// Server-side fetches of user-supplied URLs must not reach the metadata server,
// loopback, or anything else on a private network.

export class UnsafeUrlError extends Error {
  readonly code = 'UNSAFE_URL';
  readonly statusCode = 400;
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
// BlockList already checks IPv4-mapped addresses (::ffff:a.b.c.d) against the
// IPv4 rules above. NAT64, Teredo and 6to4 also embed IPv4 addresses.
for (const [net, prefix] of [
  ['::', 128], ['::1', 128],
  ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['2001::', 32], ['2002::', 16],
  ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal']);

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) return blocked.check(address, 'ipv6');
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.internal');
}

/** Whether `value` parses as an http: or https: URL (no network or address checks). */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parses `raw` and throws UnsafeUrlError unless it is an http(s) URL whose host
 * resolves only to public addresses.
 */
export async function assertSafeFetchUrl(raw: string | URL): Promise<URL> {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs are allowed');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname || isBlockedHostname(hostname)) {
    throw new UnsafeUrlError('URL host is not allowed');
  }
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new UnsafeUrlError('URL host is not allowed');
    return url;
  }
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError('URL host could not be resolved');
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new UnsafeUrlError('URL host is not allowed');
  }
  return url;
}

// Re-checks the addresses at connect time, so a DNS answer that changes between
// assertSafeFetchUrl and the request cannot slip a private address through.
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4);
    const list = addresses as unknown as dns.LookupAddress[];
    const first = list[0];
    if (!first || list.some((a) => isBlockedAddress(a.address))) {
      return callback(new UnsafeUrlError('URL host is not allowed') as NodeJS.ErrnoException, '', 4);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    return callback(null, first.address, first.family);
  });
};

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  buffer: Buffer;
  contentType: string | null;
}

function getOnce(url: URL, timeoutMs: number, maxBytes: number, headers: Record<string, string>): Promise<{ status: number; location?: string; result?: SafeFetchResult }> {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, { lookup: guardedLookup, headers, signal: AbortSignal.timeout(timeoutMs) }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.resume();
        return resolve({ status, ...(res.headers.location ? { location: res.headers.location } : {}) });
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new Error(`Response exceeds ${maxBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({
        status,
        result: { buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] ?? null },
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

/** GETs a user-supplied URL, re-validating every redirect hop. Throws on non-200. */
export async function safeFetchBuffer(raw: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { timeoutMs = 15000, maxBytes = 20 * 1024 * 1024, maxRedirects = 3, headers = {} } = options;
  let url = await assertSafeFetchUrl(raw);
  for (let hop = 0; ; hop++) {
    const res = await getOnce(url, timeoutMs, maxBytes, headers);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new Error(`HTTP ${res.status} without Location fetching ${url.origin}`);
      if (hop >= maxRedirects) throw new Error(`Too many redirects fetching ${url.origin}`);
      url = await assertSafeFetchUrl(new URL(res.location, url));
      continue;
    }
    if (res.status !== 200 || !res.result) throw new Error(`HTTP ${res.status} fetching ${url.origin}`);
    return res.result;
  }
}
