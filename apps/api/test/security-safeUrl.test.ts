import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { assertSafeFetchUrl, safeFetchBuffer, UnsafeUrlError } from '../src/lib/safeUrl.js';
import { safeFileId } from '../src/lib/uploadPaths.js';

describe('assertSafeFetchUrl', () => {
  const blocked = [
    'http://127.0.0.1/',
    'http://localhost:3001/uploads/x.png',
    'http://api.localhost/',
    'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://metadata/computeMetadata/v1/',
    'http://10.0.0.1/',
    'http://172.16.5.4/',
    'http://192.168.1.1/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://2130706433/',
    'http://0x7f000001/',
    'http://[::1]/',
    'http://[::]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:169.254.169.254]/',
    'file:///etc/passwd',
    'gopher://127.0.0.1:6379/_INFO',
    'ftp://example.com/',
    '/etc/passwd',
    'not a url',
  ];

  for (const url of blocked) {
    it(`rejects ${url}`, async () => {
      await assert.rejects(assertSafeFetchUrl(url), UnsafeUrlError);
    });
  }

  it('accepts a public IP literal', async () => {
    const url = await assertSafeFetchUrl('https://8.8.8.8/logo.png');
    assert.equal(url.hostname, '8.8.8.8');
  });

  it('rejects a hostname that resolves to a private address', async (t) => {
    t.mock.method(dns.promises, 'lookup', async () => [{ address: '10.1.2.3', family: 4 }]);
    await assert.rejects(assertSafeFetchUrl('https://intranet.example.test/'), UnsafeUrlError);
  });

  it('rejects a hostname when any resolved address is private', async (t) => {
    t.mock.method(dns.promises, 'lookup', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);
    await assert.rejects(assertSafeFetchUrl('https://mixed.example.test/'), UnsafeUrlError);
  });

  it('accepts a hostname that resolves to public addresses only', async (t) => {
    t.mock.method(dns.promises, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
    const url = await assertSafeFetchUrl('https://cdn.example.test/car.jpg');
    assert.equal(url.pathname, '/car.jpg');
  });
});

describe('safeFetchBuffer', () => {
  async function withLocalServer(fn: (port: number) => Promise<void>) {
    let hits = 0;
    const server = http.createServer((_req, res) => {
      hits += 1;
      res.end('secret');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await fn((server.address() as AddressInfo).port);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    return hits;
  }

  it('refuses to fetch a loopback server', async () => {
    const hits = await withLocalServer(async (port) => {
      await assert.rejects(safeFetchBuffer(`http://127.0.0.1:${port}/`), UnsafeUrlError);
    });
    assert.equal(hits, 0);
  });

  it('re-checks DNS at connect time (rebinding)', async (t) => {
    // The pre-check sees a public address, the connection would get loopback.
    t.mock.method(dns.promises, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
    t.mock.method(dns, 'lookup', (_host: string, _opts: unknown, cb: (...args: unknown[]) => void) => {
      cb(null, [{ address: '127.0.0.1', family: 4 }]);
    });
    const hits = await withLocalServer(async (port) => {
      await assert.rejects(safeFetchBuffer(`http://rebind.example.test:${port}/`), UnsafeUrlError);
    });
    assert.equal(hits, 0);
  });
});

describe('safeFileId', () => {
  it('strips directories from client-supplied ids', () => {
    assert.equal(safeFileId('abc.jpg'), 'abc.jpg');
    assert.equal(safeFileId('../../../etc/passwd'), 'passwd');
    assert.equal(safeFileId('/uploads/originals/abc.png'), 'abc.png');
  });

  it('rejects ids that name no file', () => {
    for (const id of ['', '.', '..', '../', undefined, null, 42]) {
      assert.throws(() => safeFileId(id), /Invalid file id/);
    }
  });
});
