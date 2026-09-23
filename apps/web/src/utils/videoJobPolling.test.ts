import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { waitForVideoJob, type VideoJobState } from './videoJobPolling.js';

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; } };
}

const job = (status: VideoJobState['status'], extra: Partial<VideoJobState> = {}): VideoJobState => ({ status, video_url: null, error: null, ...extra });

describe('waitForVideoJob', () => {
  it('polls until the job is ready', async () => {
    const c = clock();
    const states = [job('queued'), job('processing'), job('ready', { video_url: 'https://cdn.test/r.mp4' })];
    let calls = 0;
    const outcome = await waitForVideoJob(async () => states[Math.min(calls++, 2)]!, { ...c, intervalMs: 5000 });
    assert.equal(outcome.kind, 'ready');
    assert.equal(calls, 3);
    assert.equal(c.now(), 10000);
  });

  it('stops when the job fails', async () => {
    const c = clock();
    const outcome = await waitForVideoJob(async () => job('failed', { error: { code: 'VEO_QUOTA_EXCEEDED', message: 'x' } }), c);
    assert.equal(outcome.kind, 'failed');
    assert.equal(outcome.kind === 'failed' ? outcome.job.error?.code : null, 'VEO_QUOTA_EXCEEDED');
  });

  it('retries through request errors until it times out', async () => {
    const c = clock();
    const outcome = await waitForVideoJob(async () => { throw new Error('network'); }, { ...c, intervalMs: 1000, timeoutMs: 3000 });
    assert.deepEqual(outcome, { kind: 'timeout' });
  });

  it('can be cancelled', async () => {
    const c = clock();
    let cancelled = false;
    const outcome = await waitForVideoJob(async () => { cancelled = true; return job('processing'); }, { ...c, isCancelled: () => cancelled });
    assert.deepEqual(outcome, { kind: 'cancelled' });
  });
});
