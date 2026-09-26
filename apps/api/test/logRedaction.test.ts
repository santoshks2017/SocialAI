import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redactApprovalToken, redactOAuthCallbackParams, redactRequestUrl } from '../src/lib/logRedaction.js';

describe('redactApprovalToken', () => {
  it('replaces the raw token in an approval link path', () => {
    assert.equal(
      redactApprovalToken('/v1/publisher/approval/qz9F3k2xA1bC-_token'),
      '/v1/publisher/approval/[redacted]',
    );
  });

  it('keeps a query string after the redacted token', () => {
    assert.equal(
      redactApprovalToken('/v1/publisher/approval/abc123?foo=bar'),
      '/v1/publisher/approval/[redacted]?foo=bar',
    );
  });

  it('leaves URLs with no approval token untouched', () => {
    assert.equal(redactApprovalToken('/v1/health'), '/v1/health');
    assert.equal(redactApprovalToken('/v1/publisher/posts/123'), '/v1/publisher/posts/123');
    assert.equal(redactApprovalToken('/v1/publisher/posts/123/approve'), '/v1/publisher/posts/123/approve');
  });
});

describe('redactOAuthCallbackParams', () => {
  it('redacts code and state on the platform connect callbacks and keeps the other parameters', () => {
    assert.equal(
      redactOAuthCallbackParams('/v1/platforms/callback/google?state=eyJhbGciOi.payload.sig&code=4%2F0AbCd&scope=email%20profile'),
      '/v1/platforms/callback/google?state=[redacted]&code=[redacted]&scope=email%20profile',
    );
    assert.equal(
      redactOAuthCallbackParams('/v1/platforms/callback/meta?code=AQB-secret&state=s1&error=&error_description=x'),
      '/v1/platforms/callback/meta?code=[redacted]&state=[redacted]&error=&error_description=x',
    );
  });

  it('redacts code and state on every /v1/auth callback, including the mock ones', () => {
    for (const path of ['/v1/auth/google/callback', '/v1/auth/facebook/callback', '/v1/auth/facebook-login/callback', '/v1/auth/google/mock-callback']) {
      assert.equal(redactOAuthCallbackParams(`${path}?code=c-123&state=s-456`), `${path}?code=[redacted]&state=[redacted]`, path);
    }
  });

  it('matches encoded parameter names and redacts a bare or repeated one', () => {
    assert.equal(
      redactOAuthCallbackParams('/v1/platforms/callback/youtube?%63ode=c1&code=c2&state'),
      '/v1/platforms/callback/youtube?%63ode=[redacted]&code=[redacted]&state=[redacted]',
    );
  });

  it('leaves other routes and callbacks without a query untouched', () => {
    assert.equal(redactOAuthCallbackParams('/v1/auth/oauth/exchange?code=x'), '/v1/auth/oauth/exchange?code=x');
    assert.equal(redactOAuthCallbackParams('/v1/publisher/posts?state=draft'), '/v1/publisher/posts?state=draft');
    assert.equal(redactOAuthCallbackParams('/v1/platforms/callback/google'), '/v1/platforms/callback/google');
    assert.equal(redactOAuthCallbackParams('/v1/platforms/connect/google?mock=true'), '/v1/platforms/connect/google?mock=true');
  });
});

describe('redactRequestUrl', () => {
  it('applies both redactions', () => {
    assert.equal(redactRequestUrl('/v1/publisher/approval/tok123'), '/v1/publisher/approval/[redacted]');
    assert.equal(redactRequestUrl('/v1/auth/google/callback?code=c&state=s'), '/v1/auth/google/callback?code=[redacted]&state=[redacted]');
    assert.equal(redactRequestUrl('/v1/health'), '/v1/health');
  });
});
