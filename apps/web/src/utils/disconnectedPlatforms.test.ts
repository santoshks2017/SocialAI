import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { disconnectedPlatformNames, disconnectedVerb } from './disconnectedPlatforms';

describe('disconnectedPlatformNames', () => {
  it('lists display names of accounts that need reconnecting, once each, in order', () => {
    const names = disconnectedPlatformNames([
      { platform: 'youtube', needs_reconnect: true },
      { platform: 'facebook', needs_reconnect: false },
      { platform: 'instagram', needs_reconnect: true },
      { platform: 'instagram', needs_reconnect: true },
      { platform: 'gmb', needs_reconnect: true },
    ]);
    assert.deepEqual(names, ['YouTube', 'Instagram', 'Google Business Profile']);
  });

  it('ignores accounts without the flag (older API responses)', () => {
    assert.deepEqual(disconnectedPlatformNames([{ platform: 'facebook' }]), []);
  });

  it('falls back to the raw platform id for unknown platforms', () => {
    assert.deepEqual(disconnectedPlatformNames([{ platform: 'linkedin', needs_reconnect: true }]), ['linkedin']);
  });

  it('uses "is" for one platform and "are" for several', () => {
    assert.equal(disconnectedVerb(1), 'is');
    assert.equal(disconnectedVerb(2), 'are');
  });
});
