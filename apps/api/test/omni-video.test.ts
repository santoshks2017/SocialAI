import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOmniRequest, buildVeoRequest, retimeOverlays, videoPrompt, type VideoOverlayBeat } from '../src/services/geminiVideo.js';

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

describe('retimeOverlays', () => {
  const beat = (id: string, startTime: number, endTime: number): VideoOverlayBeat => ({ id, startTime, endTime, title: id.toUpperCase(), position: 'bottom' });

  it('stretches the planned beats onto the clip the model actually returned', () => {
    const beats = [beat('a', 0, 3.5), beat('b', 3.5, 7.2), beat('c', 7.2, 10)];
    assert.deepEqual(retimeOverlays(beats, 10, 8).map((b) => [b.startTime, b.endTime]), [[0, 2.8], [2.8, 5.76], [5.76, 8]]);
    assert.equal(retimeOverlays(beats, 10, 8)[2]!.title, 'C');
  });

  it('keeps beats inside the clip and leaves them alone without a usable length', () => {
    const beats = [beat('a', -1, 12)];
    assert.deepEqual(retimeOverlays(beats, 10, 10).map((b) => [b.startTime, b.endTime]), [[0, 10]]);
    assert.equal(retimeOverlays(beats, 10, 0), beats);
    assert.equal(retimeOverlays(beats, 0, 8), beats);
    assert.equal(retimeOverlays(beats, 10, Number.NaN), beats);
  });
});
