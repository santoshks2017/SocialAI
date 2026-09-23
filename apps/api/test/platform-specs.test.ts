import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fastify } from '../src/index.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

function headers() {
  const payload: JwtUser = { dealer_user_id: 'u1', dealer_id: 'd1', role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

describe('GET /v1/platform-specs', () => {
  it('returns per-platform format limits', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/platform-specs', headers: headers() });
    assert.equal(res.statusCode, 200);
    const { data } = res.json() as { data: Record<string, Record<string, { supported: boolean; aspectRatio: string; captionMaxChars: number | null; hashtagsMax: number | null }>> };
    assert.equal(data['instagram']!['post']!.captionMaxChars, 2200);
    assert.equal(data['instagram']!['post']!.hashtagsMax, 30);
    assert.equal(data['facebook']!['reel']!.aspectRatio, '9:16');
    assert.equal(data['gmb']!['post']!.captionMaxChars, 1500);
    assert.equal(data['youtube']!['post']!.supported, false);
    assert.equal(data['common']!['post']!.aspectRatio, '1:1');
    assert.equal(data['common']!['reel']!.aspectRatio, '9:16');
  });

  it('requires a signed-in user', async () => {
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      assert.equal((await fastify.inject({ method: 'GET', url: '/v1/platform-specs' })).statusCode, 401);
    } finally {
      process.env['NODE_ENV'] = previous;
    }
  });
});
