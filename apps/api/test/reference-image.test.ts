import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { prepareReferenceImage, referenceImage } from '../src/services/reelRenderers.js';

describe('prepareReferenceImage', () => {
  it('turns a photo upright from its EXIF orientation', async () => {
    const sideways = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#c2564f' } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const prepared = await prepareReferenceImage(sideways);
    assert.ok(prepared);
    assert.equal(prepared.mimeType, 'image/jpeg');
    const meta = await sharp(prepared.data).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', 100, 200]);
  });

  it('puts transparent areas on white', async () => {
    const clear = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const prepared = await prepareReferenceImage(clear);
    assert.ok(prepared);
    const { data, info } = await sharp(prepared.data).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 3);
    assert.ok(data[0]! > 245 && data[1]! > 245 && data[2]! > 245, `pixel ${[...data.subarray(0, 3)]}`);
  });

  it('fits large photos inside 1280 px', async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#3c7d58' } }).jpeg().toBuffer();
    const meta = await sharp((await prepareReferenceImage(big))!.data).metadata();
    assert.deepEqual([meta.width, meta.height], [1280, 853]);
  });

  it('returns null for a photo it cannot decode, logging only the message', async (ctx) => {
    const warn = ctx.mock.method(console, 'warn', () => {});
    assert.equal(await prepareReferenceImage(Buffer.from('ftypheic-not-really-an-image')), null);
    assert.equal(warn.mock.callCount(), 1);
    for (const arg of warn.mock.calls[0]!.arguments) assert.equal(typeof arg, 'string');
  });
});

describe('referenceImage', () => {
  it('carries on without a photo it cannot read', async (ctx) => {
    ctx.mock.method(console, 'warn', () => {});
    assert.equal(await referenceImage('/uploads/does-not-exist-reference.jpg'), undefined);
  });
});
