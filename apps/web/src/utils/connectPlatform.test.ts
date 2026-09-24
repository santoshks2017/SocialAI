import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OAUTH_RETURN_KEY, oauthToast, parseOAuthReturn, readOAuthReturn } from './connectPlatform.js';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true, writable: true });
});

describe('OAuth return path', () => {
  it('accepts only the three in-app return paths', () => {
    assert.equal(parseOAuthReturn('/onboarding'), '/onboarding');
    assert.equal(parseOAuthReturn('/settings?tab=platforms'), '/settings?tab=platforms');
    assert.equal(parseOAuthReturn('/accounts'), '/accounts');
    assert.equal(parseOAuthReturn('https://evil.test/accounts'), '/accounts');
    assert.equal(parseOAuthReturn('//evil.test'), '/accounts');
    assert.equal(parseOAuthReturn(null), '/accounts');
  });

  it('reads the stored path once', () => {
    globalThis.sessionStorage.setItem(OAUTH_RETURN_KEY, '/onboarding');
    assert.equal(readOAuthReturn(), '/onboarding');
    assert.equal(globalThis.sessionStorage.getItem(OAUTH_RETURN_KEY), null);
    assert.equal(readOAuthReturn(), '/accounts');
    assert.equal(OAUTH_RETURN_KEY, 'oauth_return_to');
  });

  it('falls back to /accounts when storage is blocked', () => {
    Object.defineProperty(globalThis, 'sessionStorage', { get() { throw new Error('blocked'); }, configurable: true });
    assert.equal(readOAuthReturn(), '/accounts');
  });
});

describe('oauthToast', () => {
  const toast = (query: string) => oauthToast(new URLSearchParams(query));

  it('names what was linked', () => {
    assert.deepEqual(toast('success=1&platform=facebook%2Cinstagram&accounts=3&fb=2&ig=1'), {
      type: 'success', title: 'Connected!', message: 'Linked: 2 Facebook page(s), 1 Instagram account(s)',
    });
    assert.equal(toast('success=1&platform=google&accounts=3&google=3')?.message, 'Linked: 3 Google Business location(s)');
    assert.equal(toast('success=1&platform=youtube&accounts=1&youtube=1')?.message, 'Linked: 1 YouTube channel(s)');
    assert.equal(toast('success=1&platform=twitter')?.message, 'Account connected successfully.');
  });

  it('explains failures', () => {
    assert.deepEqual(toast('error=access_denied&platform=google'), {
      type: 'error', title: 'Connection failed', message: 'Access was denied. Please try again and accept the permissions.',
    });
    assert.equal(
      toast('error=Account%20limit%20reached%20(30).%20Disconnect%20an%20account%20to%20add%20another.')?.message,
      'Account limit reached (30). Disconnect an account to add another.',
    );
    assert.equal(toast('error=weird_code')?.message, 'OAuth error: weird_code');
    assert.equal(toast(''), null);
  });
});
