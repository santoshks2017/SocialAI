import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkGeminiKey } from '../src/lib/geminiKeyCheck.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('checkGeminiKey', () => {
  it('reports image and Veo access from the model list, sending the key as a header', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
      jsonResponse(200, { models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/gemini-2.5-flash-image' }, { name: 'models/veo-3.1-fast-generate-preview' }] }));
    const result = await checkGeminiKey('good-key');
    assert.deepEqual(result, { ok: true, detail: 'Key works — image models available, Veo video available.', canGenerateImages: true, canGenerateVideo: true });
    const [url, init] = fetchMock.mock.calls[0]!.arguments as [string, RequestInit];
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models'));
    assert.ok(!url.includes('good-key'));
    assert.equal((init.headers as Record<string, string>)['x-goog-api-key'], 'good-key');
  });

  it('says so when the key has no Veo access', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(200, { models: [{ name: 'models/gemini-2.5-flash' }] }));
    const result = await checkGeminiKey('k');
    assert.equal(result.ok, true);
    assert.equal(result.canGenerateVideo, false);
    assert.equal(result.detail, 'Key works — no image models, no Veo access.');
  });

  it('returns Google’s message for a rejected key', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }));
    const result = await checkGeminiKey('bad');
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'API key not valid. Please pass a valid API key.');
  });

  it('reports a network failure without throwing', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('getaddrinfo ENOTFOUND'); });
    const result = await checkGeminiKey('k');
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'Could not reach Google: getaddrinfo ENOTFOUND');
  });
});
