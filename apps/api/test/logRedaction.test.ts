import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redactApprovalToken } from '../src/lib/logRedaction.js';

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
