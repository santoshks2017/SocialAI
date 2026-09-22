import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getFrontendUrl, PRODUCTION_FRONTEND_URL, DEV_FRONTEND_URL } from '../src/lib/frontendUrl.js';

describe('getFrontendUrl (frontendUrl.ts)', () => {
  it('uses FRONTEND_URL when set', () => {
    assert.equal(
      getFrontendUrl({ FRONTEND_URL: 'https://staging.example.com', NODE_ENV: 'production' }),
      'https://staging.example.com',
    );
  });

  it('strips trailing slashes and whitespace from FRONTEND_URL', () => {
    assert.equal(getFrontendUrl({ FRONTEND_URL: ' https://example.com// ' }), 'https://example.com');
  });

  it('defaults to the live Firebase Hosting domain in production', () => {
    assert.equal(getFrontendUrl({ NODE_ENV: 'production' }), 'https://cardekho-social-ai.web.app');
    assert.equal(PRODUCTION_FRONTEND_URL, 'https://cardekho-social-ai.web.app');
  });

  it('treats an empty FRONTEND_URL as unset', () => {
    assert.equal(getFrontendUrl({ FRONTEND_URL: '', NODE_ENV: 'production' }), PRODUCTION_FRONTEND_URL);
    assert.equal(getFrontendUrl({ FRONTEND_URL: '   ' }), DEV_FRONTEND_URL);
  });

  it('defaults to the Vite dev server outside production', () => {
    assert.equal(getFrontendUrl({}), 'http://localhost:5173');
    assert.equal(getFrontendUrl({ NODE_ENV: 'development' }), DEV_FRONTEND_URL);
    assert.equal(getFrontendUrl({ NODE_ENV: 'test' }), DEV_FRONTEND_URL);
  });

  it('never falls back to the retired social-ai.web.app domain', () => {
    for (const NODE_ENV of ['production', 'development', 'test', undefined]) {
      assert.doesNotMatch(getFrontendUrl({ NODE_ENV }), /(^|\/\/)social-ai(-ed9cf)?\.(web\.app|firebaseapp\.com)/);
    }
  });
});
