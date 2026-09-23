import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { invalidateAiKeyCache } from '../src/lib/aiKeys.js';
import { invalidateAiModelCache } from '../src/lib/aiModels.js';
import { generateGeminiImage } from '../src/services/geminiImage.js';
import { elaboratePromptBrief } from '../src/services/geminiService.js';

const TEST_KEY = 'test-key-not-real-0000';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });
beforeEach(async () => {
  await prisma.apiConnectionSecret.deleteMany({});
  await prisma.apiConnection.deleteMany({});
  // A developer .env can pin GEMINI_TEXT_MODEL/GEMINI_IMAGE_MODEL to older defaults; clear them so
  // these tests see the latest defaults regardless of local environment (see ai-models.test.ts).
  delete process.env['GEMINI_TEXT_MODEL'];
  delete process.env['GEMINI_IMAGE_MODEL'];
  process.env['GEMINI_API_KEY'] = TEST_KEY;
  invalidateAiKeyCache();
  invalidateAiModelCache();
});

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('image generation', () => {
  it('uses the chosen image model with header auth', async (t) => {
    await prisma.apiConnection.create({ data: { name: 'Deploy key', provider: 'google-gemini', image_model: 'gemini-3-pro-image' } });
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    t.mock.method(axios, 'post', async (url: string, _body: unknown, config: { headers: Record<string, string> }) => {
      calls.push({ url, headers: config.headers });
      return { data: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG_1PX } }] } }] } };
    });
    await generateGeminiImage('A showroom at dusk');
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/models\/gemini-3-pro-image:generateContent$/);
    assert.equal(calls[0]!.headers['x-goog-api-key'], TEST_KEY);
    assert.doesNotMatch(calls[0]!.url, /key=/);
  });
});

describe('text generation', () => {
  it('uses the latest text model first and falls back to Flash-Lite', async (t) => {
    const urls: string[] = [];
    t.mock.method(axios, 'post', async (url: string, _body: unknown, config: { headers: Record<string, string> }) => {
      urls.push(url);
      assert.equal(config.headers['x-goog-api-key'], TEST_KEY);
      if (url.includes('gemini-3.8-flash')) throw Object.assign(new Error('quota'), { response: { status: 429 } });
      return { data: { candidates: [{ content: { parts: [{ text: JSON.stringify({ brand: 'Hyundai', model_name: 'Creta', car_angle: 'front', background_theme: 'city', background_details: 'x', lighting_mood: 'warm', headline: 'NEW CRETA', caption: 'c', hashtags: ['#Creta'] }) }] } }] } };
    });
    const brief = await elaboratePromptBrief('Creta offer');
    assert.equal(brief.model_name, 'Creta');
    assert.match(urls[0]!, /gemini-3\.8-flash:generateContent$/);
    assert.ok(urls.some((u) => /gemini-3\.5-flash-lite:generateContent$/.test(u)));
    assert.ok(urls.every((u) => !u.includes('key=')));
  });
});
