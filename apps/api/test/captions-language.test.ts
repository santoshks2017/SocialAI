import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { briefCaptionInstructions, captionLanguage, normalizeLanguage } from '../src/lib/languages.js';
import { elaboratePromptBrief } from '../src/services/geminiService.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

const headers = () => {
  const payload: JwtUser = { dealer_user_id: 'u1', dealer_id: 'd1', role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
};

describe('languages', () => {
  it('normalizes unknown codes to English', () => {
    assert.equal(normalizeLanguage('ta'), 'ta');
    assert.equal(normalizeLanguage('toString'), 'en');
    assert.equal(normalizeLanguage(undefined), 'en');
  });

  it('keeps the Hinglish-first captions for English and switches all three for other languages', () => {
    assert.match(captionLanguage('en'), /Hinglish/);
    assert.equal(captionLanguage('hi'), 'Hindi in its native script');
    const [first, second] = briefCaptionInstructions('en');
    assert.match(first, /Hinglish/);
    assert.match(second, /professional English/);
    for (const line of briefCaptionInstructions('mr')) assert.match(line, /Marathi \(native script\)/);
  });
});

describe('POST /v1/creatives/hashtags', () => {
  it('asks Gemini first, passes the language and returns #-prefixed tags', async (t) => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const { invalidateAiKeyCache } = await import('../src/lib/aiKeys.js');
    invalidateAiKeyCache();
    const calls: Array<{ url: string; body: { contents: Array<{ parts: Array<{ text: string }> }> } }> = [];
    t.mock.method(axios, 'post', async (url: string, body: never) => {
      calls.push({ url, body });
      return { data: { candidates: [{ content: { parts: [{ text: '```json\n["#Creta", "CarDeal", "#पुणे"]\n```' }] } }] } };
    });

    const res = await fastify.inject({ method: 'POST', url: '/v1/creatives/hashtags', headers: headers(), payload: { caption: 'Creta offer in Pune', city: 'Pune', language: 'hi' } });

    assert.equal(res.statusCode, 200);
    assert.deepEqual((res.json() as { hashtags: string[] }).hashtags, ['#Creta', '#CarDeal', '#पुणे']);
    assert.match(calls[0]!.url, /generativelanguage\.googleapis\.com/);
    assert.match(calls[0]!.body.contents[0]!.parts[0]!.text, /Hindi/);
    delete process.env['GEMINI_API_KEY'];
    invalidateAiKeyCache();
  });

  it('keeps Indian-script tags whole when Gemini answers with plain text', async (t) => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const { invalidateAiKeyCache } = await import('../src/lib/aiKeys.js');
    invalidateAiKeyCache();
    t.mock.method(axios, 'post', async () => ({ data: { candidates: [{ content: { parts: [{ text: 'Try these: #पुणे, #சென்னை and #Creta_2026' }] } }] } }));

    const res = await fastify.inject({ method: 'POST', url: '/v1/creatives/hashtags', headers: headers(), payload: { caption: 'Creta offer', language: 'ta' } });

    assert.equal(res.statusCode, 200);
    assert.deepEqual((res.json() as { hashtags: string[] }).hashtags, ['#पुणे', '#சென்னை', '#Creta_2026']);
    delete process.env['GEMINI_API_KEY'];
    invalidateAiKeyCache();
  });
});

describe('elaboratePromptBrief', () => {
  it('asks for the image headline in English (Latin script) when captions are in another language', async (t) => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const { invalidateAiKeyCache } = await import('../src/lib/aiKeys.js');
    invalidateAiKeyCache();
    const prompts: string[] = [];
    t.mock.method(axios, 'post', async (_url: string, body: { contents: Array<{ parts: Array<{ text: string }> }> }) => {
      prompts.push(body.contents[0]!.parts[0]!.text);
      return { data: { candidates: [{ content: { parts: [{ text: '{}' }] } }] } };
    });

    await elaboratePromptBrief('Creta Diwali exchange offer', null, 'ta');

    assert.equal(prompts.length, 1);
    assert.match(prompts[0]!, /"headline": "[^"]*written in English \(Latin script\)[^"]*"/);
    assert.match(prompts[0]!, /"caption": "[^"]*Tamil/);
    delete process.env['GEMINI_API_KEY'];
    invalidateAiKeyCache();
  });
});
