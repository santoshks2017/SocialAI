import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderCreative } from './index.js';

describe('render-engine', () => {
  it('renders creative and returns a valid PNG Buffer', async () => {
    const buffer = await renderCreative({
      title: 'Grand Diwali Sale',
      offer: 'Flat ₹50,000 Off on Creta',
      imageUrl: ''
    });

    assert.ok(Buffer.isBuffer(buffer), 'Output should be a Buffer');
    assert.ok(buffer.length > 0, 'Buffer should not be empty');

    // PNG signature check: 89 50 4E 47 0D 0A 1A 0A
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(
      buffer.subarray(0, 8).equals(pngSignature),
      true,
      'Buffer should have standard PNG magic header'
    );
  });

  it('handles non-existent image URL gracefully without throwing', async () => {
    const buffer = await renderCreative({
      title: 'Test Vehicle',
      offer: 'Best Exchange Bonus',
      imageUrl: 'http://invalid-localhost-domain-123456.com/car.png'
    });

    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 0);
  });
});
