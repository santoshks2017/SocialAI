import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { invalidateAiKeyCache } from '../src/lib/aiKeys.js';
import {
  DEFAULT_MODELS, MODEL_OPTIONS, TEXT_FALLBACK_MODEL, invalidateAiModelCache, isReelEngine, isValidModelId, isVideoResolution,
  modelLabel, pickModels, resolveAiModels,
} from '../src/lib/aiModels.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });
beforeEach(async () => {
  await prisma.apiConnectionSecret.deleteMany({});
  await prisma.apiConnection.deleteMany({});
  for (const k of ['GEMINI_API_KEY', 'GEMINI_TEXT_MODEL', 'GEMINI_IMAGE_MODEL', 'GEMINI_VIDEO_MODEL', 'GEMINI_OMNI_RESOLUTION', 'VIDEO_DEFAULT_ENGINE']) delete process.env[k];
  invalidateAiKeyCache();
  invalidateAiModelCache();
});

describe('pickModels', () => {
  it('defaults to the latest models', () => {
    assert.deepEqual(pickModels(null, {}), {
      text: 'gemini-3.8-flash', textFallbacks: ['gemini-3.5-flash-lite'], image: 'gemini-3.1-flash-image',
      video: 'gemini-omni-1.1-flash', videoResolution: '720p', reelEngine: 'ai',
    });
    assert.equal(DEFAULT_MODELS.text, 'gemini-3.8-flash');
    assert.equal(TEXT_FALLBACK_MODEL, 'gemini-3.5-flash-lite');
  });

  it('prefers saved choices over env vars over defaults', () => {
    const env = { GEMINI_TEXT_MODEL: 'gemini-3.5-flash', GEMINI_IMAGE_MODEL: 'gemini-3-pro-image', GEMINI_OMNI_RESOLUTION: '1080p', VIDEO_DEFAULT_ENGINE: 'kenburns' };
    const fromEnv = pickModels(null, env);
    assert.deepEqual([fromEnv.text, fromEnv.image, fromEnv.videoResolution, fromEnv.reelEngine], ['gemini-3.5-flash', 'gemini-3-pro-image', '1080p', 'quick']);
    const saved = pickModels({ text_model: 'gemini-3.1-pro-preview', video_model: 'veo-3.1-generate-preview', video_resolution: '4k', reel_engine: 'ai' }, env);
    assert.deepEqual([saved.text, saved.image, saved.video, saved.videoResolution, saved.reelEngine], ['gemini-3.1-pro-preview', 'gemini-3-pro-image', 'veo-3.1-generate-preview', '4k', 'ai']);
  });

  it('ignores invalid stored or env values and never lists the chosen text model as its own fallback', () => {
    const m = pickModels({ text_model: 'Bad Model!', video_resolution: '8k', reel_engine: 'turbo' }, { GEMINI_VIDEO_MODEL: '  ' });
    assert.deepEqual([m.text, m.video, m.videoResolution, m.reelEngine], ['gemini-3.8-flash', 'gemini-omni-1.1-flash', '720p', 'ai']);
    assert.deepEqual(pickModels({ text_model: 'gemini-3.5-flash-lite' }, {}).textFallbacks, []);
  });
});

describe('validators and labels', () => {
  it('checks ids, resolutions and engines', () => {
    assert.equal(isValidModelId('gemini-3.9-flash'), true);
    assert.equal(isValidModelId('models/gemini'), false);
    assert.equal(isValidModelId('x'), false);
    assert.equal(isVideoResolution('1080p'), true);
    assert.equal(isVideoResolution('2k'), false);
    assert.equal(isReelEngine('quick'), true);
    assert.equal(isReelEngine('veo'), false);
    assert.equal(modelLabel('video', 'gemini-omni-1.1-flash'), 'Gemini Omni 1.1 Flash');
    assert.equal(modelLabel('text', 'gemini-9-ultra'), 'gemini-9-ultra');
  });

  it('offers Omni first, then the Veo 3.1 family', () => {
    assert.deepEqual(MODEL_OPTIONS.video, [
      { id: 'gemini-omni-1.1-flash', label: 'Gemini Omni 1.1 Flash' },
      { id: 'veo-3.1-generate-preview', label: 'Veo 3.1 (preview)' },
      { id: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast (preview)' },
      { id: 'veo-3.1-lite-generate-preview', label: 'Veo 3.1 Lite (preview)' },
    ]);
  });
});

describe('resolveAiModels', () => {
  it('uses the earliest enabled Gemini connection when no saved key is in use', async () => {
    await prisma.apiConnection.create({ data: { name: 'Deploy key', provider: 'google-gemini', image_model: 'gemini-3-pro-image' } });
    const m = await resolveAiModels();
    assert.equal(m.image, 'gemini-3-pro-image');
    assert.equal(m.text, 'gemini-3.8-flash');
  });

  it('falls back to defaults with no connections', async () => {
    assert.equal((await resolveAiModels()).video, 'gemini-omni-1.1-flash');
  });
});
