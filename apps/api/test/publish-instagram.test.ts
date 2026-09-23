import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { publishToInstagram } from '../src/services/meta.js';

const NO_WAIT = [0, 0, 0, 0];

const PERMALINK = 'https://www.instagram.com/p/DAbC123xYz/';

// Container status checks return `statuses` in order (the last one repeats).
function mockGraph(t: TestContext, statuses: Array<{ status_code: string; status?: string }>, permalink: 'ok' | 'fails' = 'ok') {
  const calls: string[] = [];
  const statusParams: unknown[] = [];
  const permalinkParams: unknown[] = [];
  t.mock.method(axios, 'post', async (url: string) => {
    calls.push(`POST ${url}`);
    if (url.endsWith('/ig-user/media')) return { data: { id: 'container-9' } };
    if (url.endsWith('/ig-user/media_publish')) return { data: { id: 'media-9' } };
    throw new Error(`unexpected POST ${url}`);
  });
  t.mock.method(axios, 'get', async (url: string, config?: { params?: unknown }) => {
    calls.push(`GET ${url}`);
    if (url.endsWith('/media-9')) {
      permalinkParams.push(config?.params);
      if (permalink === 'fails') throw new Error('Request failed with status code 500');
      return { data: { permalink: PERMALINK, id: 'media-9' } };
    }
    if (!url.endsWith('/container-9')) throw new Error(`unexpected GET ${url}`);
    statusParams.push(config?.params);
    const next = statuses[Math.min(statusParams.length - 1, statuses.length - 1)];
    return { data: next };
  });
  return { calls, statusParams, permalinkParams };
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
      'media-9',
    ]);
  });

  it("links to the post's permalink, since the media id isn't the id in Instagram links", async (t) => {
    const { permalinkParams } = mockGraph(t, [{ status_code: 'FINISHED' }]);
    const result = await publishToInstagram('ig-user', 'token', 'https://cdn.example.com/a.jpg', 'caption', NO_WAIT);
    assert.deepEqual(result, { post_id: 'media-9', url: PERMALINK });
    assert.deepEqual(permalinkParams, [{ fields: 'permalink', access_token: 'token' }]);
  });

  it('keeps the post published with the fallback link when the permalink request fails', async (t) => {
    mockGraph(t, [{ status_code: 'FINISHED' }], 'fails');
    const warn = t.mock.method(console, 'warn', () => {});
    const result = await publishToInstagram('ig-user', 'token', 'https://cdn.example.com/a.jpg', 'caption', NO_WAIT);
    assert.deepEqual(result, { post_id: 'media-9', url: 'https://www.instagram.com/p/media-9/' });
    // Only the message is logged: a raw axios error carries the request, including the access token.
    for (const call of warn.mock.calls) {
      for (const arg of call.arguments) assert.ok(!(arg instanceof Error) && !JSON.stringify(arg ?? null).includes('token'));
    }
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
