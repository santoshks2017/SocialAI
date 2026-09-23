import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizePublishResult, publishErrorMessage } from './publishResult.js';

describe('summarizePublishResult', () => {
  it('treats the original queued response as success', () => {
    const out = summarizePublishResult({ success: true, status: 'publishing', job_ids: ['1'], skipped_platforms: [] }, ['facebook']);
    assert.deepEqual(out, { ok: true, message: null });
  });

  it('treats an inline publish with no jobs and nothing skipped as success', () => {
    const out = summarizePublishResult({ success: true, status: 'publishing', job_ids: [], skipped_platforms: [] }, ['facebook']);
    assert.equal(out.ok, true);
  });

  it('fails when every requested platform was skipped', () => {
    const out = summarizePublishResult({ success: true, status: 'publishing', job_ids: [], skipped_platforms: ['facebook', 'gmb'] }, ['facebook', 'gmb']);
    assert.equal(out.ok, false);
    assert.match(out.message ?? '', /Facebook, Google Business/);
  });

  it('warns about partially skipped platforms', () => {
    const out = summarizePublishResult({ success: true, status: 'publishing', job_ids: ['1'], skipped_platforms: ['instagram'] }, ['facebook', 'instagram']);
    assert.equal(out.ok, true);
    assert.match(out.message ?? '', /Instagram/);
  });

  it('fails on a failed status and surfaces the error message', () => {
    const out = summarizePublishResult({ success: false, status: 'failed', error: { message: 'Token expired' } }, ['facebook']);
    assert.deepEqual(out, { ok: false, message: 'Token expired' });
  });

  it('fails when all per-platform results failed (array form)', () => {
    const out = summarizePublishResult({
      status: 'publishing',
      results: [
        { platform: 'facebook', success: false, error: 'Invalid token' },
        { platform: 'instagram', status: 'failed', error: { message: 'Media URL unreachable' } },
      ],
    }, ['facebook', 'instagram']);
    assert.equal(out.ok, false);
    assert.equal(out.message, 'Facebook: Invalid token; Instagram: Media URL unreachable');
  });

  it('reports partial failures from per-platform results (object form)', () => {
    const out = summarizePublishResult({
      status: 'published',
      results: { facebook: { success: true }, gmb: { success: false, error: 'Location not verified' } },
    }, ['facebook', 'gmb']);
    assert.equal(out.ok, true);
    assert.equal(out.message, 'Google Business: Location not verified');
  });

  it('fails on an empty response', () => {
    assert.equal(summarizePublishResult(null, ['facebook']).ok, false);
  });

  it('warns on the final 200 contract with a failed platform', () => {
    const out = summarizePublishResult({
      success: true,
      status: 'published',
      results: [
        { platform: 'facebook', success: true, post_id: '1_2', url: 'https://facebook.com/1_2' },
        { platform: 'instagram', success: false, error: 'Media URL unreachable' },
      ],
      failed_platforms: ['instagram'],
      skipped_platforms: [],
      job_ids: [],
      scheduled_at: null,
    }, ['facebook', 'instagram']);
    assert.deepEqual(out, { ok: true, message: 'Instagram: Media URL unreachable' });
  });

  it('names failed_platforms that have no result entry', () => {
    const out = summarizePublishResult({ success: true, status: 'published', results: [{ platform: 'facebook', success: true }], failed_platforms: ['gmb'] }, ['facebook', 'gmb']);
    assert.deepEqual(out, { ok: true, message: 'Google Business failed' });
  });
});

describe('publishErrorMessage', () => {
  const apiError = (message: string, data?: unknown) => Object.assign(new Error(message), { data });

  it('uses the 502 message when it already names each failure', () => {
    const err = apiError('Could not publish to any platform. Facebook: Invalid token', {
      success: false,
      status: 'failed',
      results: [{ platform: 'facebook', success: false, error: 'Invalid token' }],
      error: { code: 'PUBLISH_FAILED', message: 'Could not publish to any platform. Facebook: Invalid token' },
    });
    assert.equal(publishErrorMessage(err, 'fallback'), 'Could not publish to any platform. Facebook: Invalid token');
  });

  it('appends per-platform errors the message leaves out', () => {
    const err = apiError('Could not publish to any platform.', {
      results: [{ platform: 'instagram', success: false, error: 'Media URL unreachable' }],
    });
    assert.equal(publishErrorMessage(err, 'fallback'), 'Could not publish to any platform. Instagram: Media URL unreachable');
  });

  it('falls back for non-errors', () => {
    assert.equal(publishErrorMessage('boom', 'fallback'), 'fallback');
  });
});
