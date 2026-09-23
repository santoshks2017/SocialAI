import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOmniRequest, buildVeoRequest, videoPrompt } from '../src/services/geminiVideo.js';

const image = { data: Buffer.from('jpeg-bytes'), mimeType: 'image/jpeg' };

describe('Omni requests', () => {
  it('asks for text-to-video at the chosen resolution', () => {
    assert.deepEqual(buildOmniRequest({ model: 'gemini-omni-1.1-flash', prompt: 'A red SUV', aspectRatio: '9:16', resolution: '1080p' }), {
      model: 'gemini-omni-1.1-flash',
      input: 'A red SUV',
      response_format: { type: 'video', aspect_ratio: '9:16', resolution: '1080p', delivery: 'uri' },
      generation_config: { video_config: { task: 'text_to_video' } },
    });
  });

  it('animates the dealer’s photo with image-to-video', () => {
    const req = buildOmniRequest({ model: 'gemini-omni-1.1-flash', prompt: 'Drive it', aspectRatio: '16:9', resolution: '720p', image }) as {
      input: Array<Record<string, string>>; generation_config: { video_config: { task: string } };
    };
    assert.deepEqual(req.input, [
      { type: 'image', data: image.data.toString('base64'), mime_type: 'image/jpeg' },
      { type: 'text', text: 'Drive it' },
    ]);
    assert.equal(req.generation_config.video_config.task, 'image_to_video');
  });
});

describe('Veo requests', () => {
  it('maps resolutions Veo supports and passes the photo', () => {
    const req = buildVeoRequest({ prompt: 'p', aspectRatio: '9:16', durationSeconds: 8, resolution: '4k', image }) as {
      instances: Array<{ prompt: string; image?: { bytesBase64Encoded: string; mimeType: string } }>; parameters: Record<string, unknown>;
    };
    assert.deepEqual(req.parameters, { sampleCount: 1, aspectRatio: '9:16', durationSeconds: 8, resolution: '1080p' });
    assert.equal(req.instances[0]!.image?.mimeType, 'image/jpeg');
    assert.equal((buildVeoRequest({ prompt: 'p', aspectRatio: '9:16', durationSeconds: 8, resolution: '360p' }) as { parameters: { resolution: string } }).parameters.resolution, '720p');
  });
});

describe('videoPrompt', () => {
  it('keeps the real car when a photo is supplied', () => {
    const withPhoto = videoPrompt({ hasImage: true, vehicleMention: 'A car', motionStyle: 'Slow orbit', visualScene: 'city at dusk' });
    assert.match(withPhoto, /same car/i);
    assert.match(withPhoto, /no text/i);
    assert.match(videoPrompt({ hasImage: false, vehicleMention: 'A car', motionStyle: 'Slow orbit', visualScene: 'city at dusk' }), /^A car\. Slow orbit\. Setting: city at dusk\./);
  });
});
