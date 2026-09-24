import { describe, it, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { buildOmniRequest, buildVeoRequest, fetchOmniVideo, fetchVeoVideo, googleFileId, keepKeyOnGoogleHost, renderDeadlineMs } from '../src/services/geminiVideo.js';
import { veoError } from '../src/services/reelRenderers.js';
import { GOOGLE_AI_BASE } from '../src/lib/googleAi.js';

const KEY = 'test-key-0000'; // placeholder, never a real key
const MP4 = Buffer.from('00000018667479706d703432', 'hex'); // an ftyp box header is enough here
const photo = { data: Buffer.from('dealer-photo-jpeg'), mimeType: 'image/jpeg' };
const FILE_URI = 'https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media';
const DOWNLOAD = `${GOOGLE_AI_BASE}/files/abc:download?alt=media`;

interface Call { method: 'get' | 'post'; url: string; body?: unknown; config: { headers?: Record<string, string>; signal?: AbortSignal; maxRedirects?: number; beforeRedirect?: unknown } }

function mockGoogle(ctx: TestContext, answer: { post: (url: string, body: unknown) => unknown; get: (url: string) => unknown }): Call[] {
  const calls: Call[] = [];
  ctx.mock.method(axios, 'post', async (url: string, body: unknown, config: Call['config']) => {
    calls.push({ method: 'post', url, body, config });
    return { data: await answer.post(url, body) };
  });
  ctx.mock.method(axios, 'get', async (url: string, config: Call['config']) => {
    calls.push({ method: 'get', url, config });
    return { data: await answer.get(url) };
  });
  return calls;
}

const quota429 = () => new AxiosError('Request failed with status code 429', 'ERR_BAD_REQUEST', undefined, undefined, {
  status: 429, statusText: 'Too Many Requests', data: {}, headers: {}, config: { headers: new AxiosHeaders() },
});

const omniAnswer = (states: string[]) => ({
  post: () => ({ steps: [{ type: 'model_output', content: [{ type: 'video', uri: FILE_URI }] }] }),
  get: (url: string) => (url.includes(':download') ? MP4 : { state: states.shift() ?? 'PROCESSING' }),
});

describe('fetchOmniVideo', () => {
  it('animates the photo, polls the file until ACTIVE and downloads it once, with the key only in a header', async (ctx) => {
    const calls = mockGoogle(ctx, omniAnswer(['PROCESSING', 'ACTIVE']));
    const signal = new AbortController().signal;
    const request = buildOmniRequest({ model: 'gemini-omni-1.1-flash', prompt: 'Drive it', aspectRatio: '9:16', resolution: '720p', image: photo });

    const video = await fetchOmniVideo({ apiKey: KEY, request, signal, pollIntervalMs: 0 });

    assert.deepEqual(video, MP4);
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [
      `post ${GOOGLE_AI_BASE}/interactions`,
      `get ${GOOGLE_AI_BASE}/files/abc`,
      `get ${GOOGLE_AI_BASE}/files/abc`,
      `get ${DOWNLOAD}`,
    ]);
    for (const c of calls) {
      assert.equal(c.config.headers?.['x-goog-api-key'], KEY, `${c.url} carries the key header`);
      assert.doesNotMatch(c.url, /[?&]key=/);
      assert.equal(c.config.signal, signal, `${c.url} honours the deadline`);
    }
    const download = calls.filter((c) => c.url.includes(':download'));
    assert.equal(download.length, 1);
    assert.equal(download[0]!.url.match(/alt=media/g)?.length, 1);
    assert.equal(typeof download[0]!.config.beforeRedirect, 'function');
    const sent = calls[0]!.body as { input: Array<{ type: string; data?: string; mime_type?: string }>; generation_config: { video_config: { task: string } } };
    assert.deepEqual(sent.input[0], { type: 'image', data: photo.data.toString('base64'), mime_type: 'image/jpeg' });
    assert.equal(sent.generation_config.video_config.task, 'image_to_video');
  });

  it('fails at once on a 429 so the reel falls back to a quick render', async (ctx) => {
    const calls: string[] = [];
    ctx.mock.method(axios, 'post', async (url: string) => { calls.push(url); throw quota429(); });
    const started = performance.now();
    const err = await fetchOmniVideo({ apiKey: KEY, request: {}, signal: new AbortController().signal }).then(() => null, (e: unknown) => e);
    assert.ok(performance.now() - started < 1000, 'no in-request retry wait');
    assert.equal(calls.length, 1);
    assert.equal(veoError(err).code, 'VEO_QUOTA_EXCEEDED');
  });

  it('gives up when the file never becomes ACTIVE, without downloading', async (ctx) => {
    const calls = mockGoogle(ctx, omniAnswer([]));
    await assert.rejects(fetchOmniVideo({ apiKey: KEY, request: {}, signal: new AbortController().signal, pollIntervalMs: 0 }), /did not finish in time/);
    assert.equal(calls.filter((c) => c.url.includes(':download')).length, 0);
  });

  it('stops polling once the overall deadline has passed', async (ctx) => {
    const controller = new AbortController();
    const calls = mockGoogle(ctx, { ...omniAnswer(['PROCESSING', 'PROCESSING', 'ACTIVE']), post: () => { controller.abort(); return omniAnswer([]).post(); } });
    await assert.rejects(fetchOmniVideo({ apiKey: KEY, request: {}, signal: controller.signal, pollIntervalMs: 0 }), /did not finish in time/);
    assert.equal(calls.filter((c) => c.method === 'get').length, 0);
  });

  it('refuses a video URI on another host instead of sending it the key', async (ctx) => {
    const calls = mockGoogle(ctx, { post: () => ({ output_video: { uri: 'https://files.example.test/v1beta/files/abc' } }), get: () => MP4 });
    await assert.rejects(fetchOmniVideo({ apiKey: KEY, request: {}, signal: new AbortController().signal, pollIntervalMs: 0 }), /unexpected host/);
    assert.equal(calls.filter((c) => c.method === 'get').length, 0);
  });
});

describe('fetchVeoVideo', () => {
  it('polls the operation and downloads the sample from the file id', async (ctx) => {
    const ops = [{ done: false }, { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: `${GOOGLE_AI_BASE}/files/xyz:download?alt=media` } }] } } }];
    const calls = mockGoogle(ctx, {
      post: () => ({ name: 'models/veo-3.1-generate-preview/operations/op1' }),
      get: (url) => (url.includes(':download') ? MP4 : ops.shift()),
    });
    const request = buildVeoRequest({ prompt: 'p', aspectRatio: '9:16', durationSeconds: 8, resolution: '720p', image: photo });
    const video = await fetchVeoVideo({ apiKey: KEY, model: 'veo-3.1-generate-preview', request, signal: new AbortController().signal, pollIntervalMs: 0 });
    assert.deepEqual(video, MP4);
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [
      `post ${GOOGLE_AI_BASE}/models/veo-3.1-generate-preview:predictLongRunning`,
      `get ${GOOGLE_AI_BASE}/models/veo-3.1-generate-preview/operations/op1`,
      `get ${GOOGLE_AI_BASE}/models/veo-3.1-generate-preview/operations/op1`,
      `get ${GOOGLE_AI_BASE}/files/xyz:download?alt=media`,
    ]);
    for (const c of calls) assert.equal(c.config.headers?.['x-goog-api-key'], KEY);
  });

  it('fails at once on a 429', async (ctx) => {
    ctx.mock.method(axios, 'post', async () => { throw quota429(); });
    const started = performance.now();
    const err = await fetchVeoVideo({ apiKey: KEY, model: 'veo-3.1-generate-preview', request: {}, signal: new AbortController().signal }).then(() => null, (e: unknown) => e);
    assert.ok(performance.now() - started < 1000);
    assert.equal(veoError(err).code, 'VEO_QUOTA_EXCEEDED');
  });

  it('gives up when the operation never finishes', async (ctx) => {
    mockGoogle(ctx, { post: () => ({ name: 'models/veo-3.1-generate-preview/operations/op1' }), get: () => ({ done: false }) });
    await assert.rejects(
      fetchVeoVideo({ apiKey: KEY, model: 'veo-3.1-generate-preview', request: {}, signal: new AbortController().signal, pollIntervalMs: 0 }),
      /did not finish in time/,
    );
  });
});

describe('Files API URIs', () => {
  it('reads the file id from each URI form Google returns', () => {
    for (const uri of [FILE_URI, `${GOOGLE_AI_BASE}/files/abc`, '/v1beta/files/abc', 'v1beta/files/abc:download?alt=media', 'files/abc', '/files/abc']) {
      assert.equal(googleFileId(uri), 'abc', uri);
    }
  });

  it('refuses other hosts, plain HTTP and URIs without a file', () => {
    assert.throws(() => googleFileId('https://files.example.test/v1beta/files/abc'), /unexpected host/);
    assert.throws(() => googleFileId('http://generativelanguage.googleapis.com/v1beta/files/abc'), /unexpected host/);
    assert.throws(() => googleFileId('https://generativelanguage.googleapis.com/v1beta/models/x'), /unexpected file URI/);
  });

  it('never forwards the key when a download redirects off the Gemini API host', () => {
    const offHost = { protocol: 'https:', hostname: 'video-downloads.example.test', headers: { 'X-Goog-Api-Key': KEY, Accept: '*/*' } };
    keepKeyOnGoogleHost(offHost);
    assert.deepEqual(offHost.headers, { Accept: '*/*' });
    const sameHost = { protocol: 'https:', hostname: 'generativelanguage.googleapis.com', headers: { 'x-goog-api-key': KEY } };
    keepKeyOnGoogleHost(sameHost);
    assert.equal(sameHost.headers['x-goog-api-key'], KEY);
    assert.throws(() => keepKeyOnGoogleHost({ protocol: 'http:', hostname: 'generativelanguage.googleapis.com', headers: {} }), /HTTPS/);
  });
});

describe('renderDeadlineMs', () => {
  it('defaults to 230 s and ignores unusable values', () => {
    assert.equal(renderDeadlineMs({}), 230_000);
    assert.equal(renderDeadlineMs({ VIDEO_RENDER_DEADLINE_MS: '90000' }), 90_000);
    for (const bad of ['', '0', '-5', 'soon']) assert.equal(renderDeadlineMs({ VIDEO_RENDER_DEADLINE_MS: bad }), 230_000, bad);
  });
});
