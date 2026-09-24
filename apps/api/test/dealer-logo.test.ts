import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { LOGO_MAX_BYTES, logoStorageKey, logoTypeFor, sniffLogoType } from '../src/lib/dealerLogo.js';
import { loadDealerLogo, loadImageFromUrl } from '../src/lib/uploadPaths.js';
import { LOGOS_DIR, ORIGINALS_DIR } from '../src/routes/upload.js';

// Local disk only: apps/api/.env may point uploads at a real bucket.
const STORAGE_ENV = ['GCS_BUCKET', 'S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'API_BASE_URL'] as const;
const savedEnv: Record<string, string | undefined> = {};

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16, 1)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

before(async () => {
  for (const key of STORAGE_ENV) { savedEnv[key] = process.env[key]; delete process.env[key]; }
  await fastify.ready();
});
after(async () => {
  for (const key of STORAGE_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await fastify.close();
});

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Logo Motors', city: 'Pune', phone: `phone-${randomUUID()}` } })).id;
}

function headers(dealerId: string): Record<string, string> {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role: 'user', phone: '+910000000000',
    permissions: resolvePermissions('user'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

function multipart(field: string, filename: string, contentType: string, data: Buffer) {
  const boundary = `----e2logo${randomUUID()}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function upload(dealerId: string, field: string, filename: string, contentType: string, data: Buffer) {
  const body = multipart(field, filename, contentType, data);
  return fastify.inject({ method: 'POST', url: '/v1/dealer/logo', headers: { ...headers(dealerId), ...body.headers }, payload: body.payload });
}

describe('dealerLogo', () => {
  it('knows PNG, JPEG and WebP by their first bytes', () => {
    assert.equal(sniffLogoType(PNG), 'png');
    assert.equal(sniffLogoType(JPEG), 'jpeg');
    assert.equal(sniffLogoType(WEBP), 'webp');
    assert.equal(sniffLogoType(SVG), null);
    assert.equal(sniffLogoType(Buffer.alloc(2)), null);
  });

  it('needs the declared type and the bytes to agree', () => {
    assert.equal(logoTypeFor('image/png', PNG), 'png');
    assert.equal(logoTypeFor('image/jpg', JPEG), 'jpeg');
    assert.equal(logoTypeFor('image/png', JPEG), null);
    assert.equal(logoTypeFor('image/svg+xml', SVG), null);
    assert.equal(logoTypeFor('application/octet-stream', PNG), null);
  });

  it('stores logos per dealership', () => {
    assert.equal(logoStorageKey('d1', 'abc', 'jpeg'), 'logos/d1/abc.jpg');
    assert.equal(logoStorageKey('d1', 'abc', 'webp'), 'logos/d1/abc.webp');
    assert.equal(LOGO_MAX_BYTES, 2 * 1024 * 1024);
  });
});

describe('POST /v1/dealer/logo', () => {
  it('stores a PNG under logos/{dealer}/ and sets the dealer logo', async () => {
    const dealerId = await newDealer();
    try {
      const res = await upload(dealerId, 'logo', 'logo.png', 'image/png', PNG);

      assert.equal(res.statusCode, 200, res.body);
      const { logo_url } = res.json() as { logo_url: string };
      assert.match(logo_url, new RegExp(`^/uploads/logos/${dealerId}/[0-9a-f-]{36}\\.png$`));
      assert.equal((await prisma.dealer.findUnique({ where: { id: dealerId } }))?.logo_url, logo_url);
      assert.ok(existsSync(path.join(LOGOS_DIR, dealerId, path.basename(logo_url))));
      assert.deepEqual((await loadImageFromUrl(logo_url)).buffer, PNG);
    } finally {
      await rm(path.join(LOGOS_DIR, dealerId), { recursive: true, force: true });
    }
  });

  it('refuses SVG, mismatched bytes, a wrong field and a plain JSON body', async () => {
    const dealerId = await newDealer();
    try {
      const svg = await upload(dealerId, 'logo', 'logo.svg', 'image/svg+xml', SVG);
      assert.equal(svg.statusCode, 400);
      assert.equal(svg.json().error.code, 'UNSUPPORTED_TYPE');
      assert.equal((await upload(dealerId, 'logo', 'logo.png', 'image/png', JPEG)).json().error.code, 'UNSUPPORTED_TYPE');

      const wrongField = await upload(dealerId, 'file', 'logo.png', 'image/png', PNG);
      assert.equal(wrongField.statusCode, 400);
      assert.equal(wrongField.json().error.code, 'INVALID_INPUT');

      const json = await fastify.inject({ method: 'POST', url: '/v1/dealer/logo', headers: headers(dealerId), payload: { logo: 'x' } });
      assert.equal(json.statusCode, 400);
      assert.equal((await prisma.dealer.findUnique({ where: { id: dealerId } }))?.logo_url ?? null, null);
    } finally {
      await rm(path.join(LOGOS_DIR, dealerId), { recursive: true, force: true });
    }
  });

  it('refuses logos over 2 MB', async () => {
    const dealerId = await newDealer();
    try {
      const res = await upload(dealerId, 'logo', 'big.png', 'image/png', Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)]));
      assert.equal(res.statusCode, 413);
      assert.equal(res.json().error.code, 'LOGO_TOO_LARGE');
      assert.equal((await prisma.dealer.findUnique({ where: { id: dealerId } }))?.logo_url ?? null, null);
    } finally {
      await rm(path.join(LOGOS_DIR, dealerId), { recursive: true, force: true });
    }
  });

  it('requires a signed-in user', async () => {
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const body = multipart('logo', 'logo.png', 'image/png', PNG);
      const res = await fastify.inject({ method: 'POST', url: '/v1/dealer/logo', headers: body.headers, payload: body.payload });
      assert.equal(res.statusCode, 401);
    } finally {
      process.env['NODE_ENV'] = previous;
    }
  });
});

describe('loadDealerLogo', () => {
  it('reads a logos/ upload from its own folder, never from originals/', async () => {
    const dealerId = `d-${randomUUID()}`;
    const name = `${randomUUID()}.png`;
    // Same file name in both folders: only the logos/ copy is this logo.
    await mkdir(path.join(LOGOS_DIR, dealerId), { recursive: true });
    await mkdir(ORIGINALS_DIR, { recursive: true });
    await writeFile(path.join(LOGOS_DIR, dealerId, name), PNG);
    await writeFile(path.join(ORIGINALS_DIR, name), JPEG);
    try {
      assert.deepEqual(await loadDealerLogo(`/uploads/logos/${dealerId}/${name}`), PNG);
      // Older logos were uploaded as originals and are still found there.
      assert.deepEqual(await loadDealerLogo(`/uploads/originals/${name}`), JPEG);
    } finally {
      await rm(path.join(LOGOS_DIR, dealerId), { recursive: true, force: true });
      await rm(path.join(ORIGINALS_DIR, name), { force: true });
    }
  });
});

describe('PUT /v1/dealer/profile use_brand_theme', () => {
  it('defaults to off, saves a boolean and refuses anything else', async () => {
    const dealerId = await newDealer();
    const get = async () => (await fastify.inject({ method: 'GET', url: '/v1/dealer/profile', headers: headers(dealerId) })).json().profile;

    assert.equal((await get()).use_brand_theme, false);
    const on = await fastify.inject({ method: 'PUT', url: '/v1/dealer/profile', headers: headers(dealerId), payload: { use_brand_theme: true } });
    assert.equal(on.statusCode, 200);
    assert.equal((await get()).use_brand_theme, true);

    const bad = await fastify.inject({ method: 'PUT', url: '/v1/dealer/profile', headers: headers(dealerId), payload: { use_brand_theme: 'yes' } });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'INVALID_INPUT');
    assert.equal((await get()).use_brand_theme, true);
  });
});
