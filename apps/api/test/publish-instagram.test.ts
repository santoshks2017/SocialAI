import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { publishToInstagram } from '../src/services/meta.js';

const NO_WAIT = [0, 0, 0, 0];

// Container status checks return `statuses` in order (the last one repeats).
function mockGraph(t: TestContext, statuses: Array<{ status_code: string; status?: string }>) {
  const calls: string[] = [];
  const statusParams: unknown[] = [];
  t.mock.method(axios, 'post', async (url: string) => {
    calls.push(`POST ${url}`);
    if (url.endsWith('/ig-user/media')) return { data: { id: 'container-9' } };
    if (url.endsWith('/ig-user/media_publish')) return { data: { id: 'media-9' } };
    throw new Error(`unexpected POST ${url}`);
  });
  t.mock.method(axios, 'get', async (url: string, config?: { params?: unknown }) => {
    calls.push(`GET ${url}`);
    if (!url.endsWith('/container-9')) throw new Error(`unexpected GET ${url}`);
    statusParams.push(config?.params);
    const next = statuses[Math.min(statusParams.length - 1, statuses.length - 1)];
    return { data: next };
  });
  return { calls, statusParams };
}

describe('publishToInstagram container polling (meta.ts)', () => {
  it('waits for the container to finish before calling media_publish', async (t) => {
    const { calls, statusParams } = mockGraph(t, [
      { status_code: 'IN_PROGRESS' },
      { status_code: 'IN_PROGRESS' },
      { status_code: 'FINISHED' },
    ]);

    const result = await publishToInstagram('ig-user', 'token', 'https://cdn.example.com/a.jpg', 'caption', NO_WAIT);
    assert.equal(result.post_id, 'media-9');
    assert.equal(statusParams.length, 3);
    assert.deepEqual(statusParams[0], { fields: 'status_code,status', access_token: 'token' });
    assert.deepEqual(calls.map((c) => c.split('/').pop()), [
      'media',
      'container-9',
      'container-9',
      'container-9',
      'media_publish',
    ]);
  });

  it('fails without publishing when the container errors', async (t) => {
    const { calls } = mockGraph(t, [{ status_code: 'ERROR', status: 'Error: Media ID is not available' }]);

    await assert.rejects(
      publishToInstagram('ig-user', 'token', 'https://cdn.example.com/a.jpg', 'caption', NO_WAIT),
      /Instagram could not process the media \(ERROR: Error: Media ID is not available\)/,
    );
    assert.ok(!calls.some((c) => c.endsWith('/media_publish')));
  });

  it('gives up after the polling budget without publishing', async (t) => {
    const { calls, statusParams } = mockGraph(t, [{ status_code: 'IN_PROGRESS' }]);

    await assert.rejects(
      publishToInstagram('ig-user', 'token', 'https://cdn.example.com/a.jpg', 'caption', [0, 0]),
      /still processing/,
    );
    assert.equal(statusParams.length, 3);
    assert.ok(!calls.some((c) => c.endsWith('/media_publish')));
  });
});
