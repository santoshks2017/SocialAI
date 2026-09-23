import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkGeminiKey } from '../src/lib/geminiKeyCheck.js';

const CHOSEN = { text: 'gemini-3.8-flash', image: 'gemini-3.1-flash-image', video: 'gemini-omni-1.1-flash' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('checkGeminiKey', () => {
  it('reports which chosen models the key can use, sending the key as a header', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
      jsonResponse(200, { models: [{ name: 'models/gemini-3.8-flash' }, { name: 'models/gemini-3.1-flash-image' }, { name: 'models/gemini-omni-1.1-flash' }] }));
    const result = await checkGeminiKey('good-key', CHOSEN);
    assert.equal(result.ok, true);
    assert.equal(result.canGenerateImages, true);
    assert.equal(result.canGenerateVideo, true);
    assert.deepEqual(result.models.map((m) => [m.kind, m.id, m.available]), [
      ['text', 'gemini-3.8-flash', true], ['image', 'gemini-3.1-flash-image', true], ['video', 'gemini-omni-1.1-flash', true],
    ]);
    assert.equal(result.detail, 'Key works — Gemini 3.8 Flash ✓, Nano Banana 2 ✓, Gemini Omni 1.1 Flash ✓.');
    const [url, init] = fetchMock.mock.calls[0]!.arguments as [string, RequestInit];
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models'));
    assert.ok(!url.includes('good-key'));
    assert.equal((init.headers as Record<string, string>)['x-goog-api-key'], 'good-key');
  });

  it('marks a chosen model unavailable and says so in the detail', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(200, { models: [{ name: 'models/gemini-3.8-flash' }] }));
    const result = await checkGeminiKey('k', CHOSEN);
    assert.equal(result.ok, true);
    assert.equal(result.canGenerateImages, false);
    assert.equal(result.canGenerateVideo, false);
    assert.equal(result.detail, 'Key works — Gemini 3.8 Flash ✓, Nano Banana 2 ✗, Gemini Omni 1.1 Flash ✗. Models marked ✗ aren’t available to this key.');
  });

  it('returns Google’s message for a rejected key', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }));
    const result = await checkGeminiKey('bad', CHOSEN);
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'API key not valid. Please pass a valid API key.');
    assert.deepEqual(result.models, []);
  });

  it('reports a network failure without throwing', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('getaddrinfo ENOTFOUND'); });
    const result = await checkGeminiKey('k', CHOSEN);
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'Could not reach Google: getaddrinfo ENOTFOUND');
    assert.deepEqual(result.models, []);
  });
});
