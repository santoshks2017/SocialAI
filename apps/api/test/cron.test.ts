import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import cronRoutes from '../src/routes/cron.js';

describe('POST /v1/cron/publish auth (cron.ts)', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalSecret = process.env['CRON_SECRET'];
  let app: FastifyInstance;

  before(async () => {
    app = Fastify();
    await app.register(cronRoutes, { prefix: '/v1/cron' });
    await app.ready();
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
    if (originalSecret === undefined) delete process.env['CRON_SECRET'];
    else process.env['CRON_SECRET'] = originalSecret;
  });

  after(async () => {
    await app.close();
  });

  const publish = (authorization?: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/cron/publish',
      ...(authorization ? { headers: { authorization } } : {}),
    });

  it('rejects every request in production when CRON_SECRET is unset', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['CRON_SECRET'];

    const noHeader = await publish();
    assert.equal(noHeader.statusCode, 503);

    const anyBearer = await publish('Bearer anything');
    assert.equal(anyBearer.statusCode, 503);
  });

  it('rejects a missing or wrong bearer token when CRON_SECRET is set', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['CRON_SECRET'] = 'test-cron-secret';

    assert.equal((await publish()).statusCode, 401);
    assert.equal((await publish('Bearer wrong-secret')).statusCode, 401);
    assert.equal((await publish('Bearer test-cron-secre')).statusCode, 401);
  });

  it('runs the publish sweep with the correct bearer token', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['CRON_SECRET'] = 'test-cron-secret';

    const response = await publish('Bearer test-cron-secret');
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.success, true);
    assert.equal(body.processed, 0);
  });

  it('still allows unauthenticated calls outside production when CRON_SECRET is unset', async () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['CRON_SECRET'];

    const response = await publish();
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).success, true);
  });
});
