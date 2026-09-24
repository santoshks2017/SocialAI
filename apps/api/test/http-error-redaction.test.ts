import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import util from 'node:util';
import axios, { AxiosError } from 'axios';
import pino from 'pino';
import { fastify } from '../src/index.js';
import { redactError } from '../src/lib/httpErrorRedaction.js';

const SECRETS = ['test-secret-123', 'tok-abc', 'abc123', 'kkk'];

let server: http.Server;
let base = '';

before(async () => {
  await fastify.ready();
  server = http.createServer((_req, res) => {
    res.writeHead(429, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Too many requests' } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fastify.close();
});

async function failedCall(): Promise<AxiosError> {
  try {
    await axios.get(`${base}/limited?access_token=abc123&key=kkk&page=2`, {
      headers: { 'x-goog-api-key': 'test-secret-123', Authorization: 'Bearer tok-abc' },
      params: { refresh_token: 'kkk', client_secret: 'abc123', q: 'cars' },
    });
  } catch (err) {
    return err as AxiosError;
  }
  throw new Error('expected the request to fail');
}

// Serialises with the serializers the API's Fastify logger was built with.
function pinoLine(err: unknown): string {
  const serializers = (fastify.log as unknown as Record<symbol, pino.LoggerOptions['serializers']>)[pino.symbols.serializersSym] ?? {};
  let out = '';
  const sink = new Writable({ write(chunk, _enc, done) { out += String(chunk); done(); } });
  pino({ serializers }, sink).error({ err }, 'call failed');
  return out;
}

describe('HTTP error redaction', () => {
  it('keeps keys, tokens and secret query params out of logged axios errors', async () => {
    const err = await failedCall();
    assert.equal(err.response?.status, 429);
    assert.deepEqual(err.response?.data, { error: { message: 'Too many requests' } });
    assert.equal(err.message, 'Request failed with status code 429');
    assert.equal(err.code, 'ERR_BAD_REQUEST');

    const inspected = util.inspect(err, { depth: 10 });
    const logged = pinoLine(err);
    for (const secret of SECRETS) {
      assert.ok(!inspected.includes(secret), `util.inspect shows ${secret}`);
      assert.ok(!logged.includes(secret), `pino output shows ${secret}`);
    }
    assert.match(logged, /\[redacted\]/);
    assert.match(logged, /page=2/);
    assert.equal((err.config?.params as Record<string, string>)['q'], 'cars');
  });

  it('redacts errors that did not pass through the interceptor when they are logged', () => {
    const err = new AxiosError('Request failed with status code 403', 'ERR_BAD_REQUEST', {
      url: 'https://graph.example.test/me?access_token=abc123',
      headers: { 'X-Api-Key': 'test-secret-123', Cookie: 'sid=tok-abc', 'x-refresh-token': 'kkk' },
    } as never);
    const logged = pinoLine(err);
    for (const secret of SECRETS) assert.ok(!logged.includes(secret), `pino output shows ${secret}`);
    assert.equal(redactError(err), err);
    assert.equal(redactError('plain text'), 'plain text');
  });
});
