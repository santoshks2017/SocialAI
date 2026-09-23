import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { carModelView, matchCarModels } from '../src/lib/carModels.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

const creta = {
  id: 'm1', brand: 'Hyundai', model_name: 'Creta', alias_names: ['creta', 'hyundai creta'],
  colours: [{ name: 'Abyss Black', hex: '#000', images: [{ angle: 'front_exterior', url: 'https://img.test/creta-black.jpg' }] }],
  images: [{ angle: 'side_exterior', url: 'https://img.test/creta-side.jpg' }, { angle: 'front_exterior', url: 'https://img.test/creta-front.jpg' }],
};
const verna = { id: 'm2', brand: 'Hyundai', model_name: 'Verna', alias_names: ['verna'], colours: [], images: [] };

describe('car model matching', () => {
  it('prefers the front exterior image and names the first colour', () => {
    assert.deepEqual(carModelView(creta), { id: 'm1', brand: 'Hyundai', model_name: 'Creta', color: 'Abyss Black', image_url: 'https://img.test/creta-front.jpg' });
    assert.deepEqual(carModelView(verna), { id: 'm2', brand: 'Hyundai', model_name: 'Verna', color: null, image_url: '' });
  });

  it('matches aliases inside the text, longest alias first', () => {
    assert.deepEqual(matchCarModels([verna, creta], 'Diwali offer on the Hyundai Creta').map((m) => m.id), ['m1']);
    assert.deepEqual(matchCarModels([verna, creta], 'nothing here'), []);
  });
});

describe('GET /v1/creatives/car-models', () => {
  it("searches the caller's synced models", async () => {
    const dealer = await prisma.dealer.create({ data: { name: 'Model Motors', city: 'Pune', phone: `phone-${randomUUID()}` } });
    await prisma.syncedModel.create({ data: { dealer_id: dealer.id, brand: 'Hyundai', model_name: 'Creta', canonical_id: 'hyundai_creta', alias_names: ['creta'], variants: [], colours: [], images: [{ angle: 'front_exterior', url: 'https://img.test/c.jpg' }] } });
    const payload: JwtUser = { dealer_user_id: 'u1', dealer_id: dealer.id, role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };

    const res = await fastify.inject({ method: 'GET', url: '/v1/creatives/car-models?q=new%20creta%20offer', headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` } });

    assert.equal(res.statusCode, 200);
    const { models } = res.json() as { models: Array<{ model_name: string; image_url: string }> };
    assert.deepEqual(models.map((m) => [m.model_name, m.image_url]), [['Creta', 'https://img.test/c.jpg']]);
  });
});
