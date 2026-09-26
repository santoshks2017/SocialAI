import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { InspirationHandle } from './settings.js';
import { handleTitle, inspirationStats, isHttpUrl, postsLearned, referencePlaceholder } from './inspiration.js';

const handle = (over: Partial<InspirationHandle>): InspirationHandle => ({
  id: 'h1', platform: 'facebook', handle_url: 'https://www.facebook.com/example', handle_name: null,
  posts_cache: null, last_scraped_at: null, created_at: '2026-09-01T00:00:00Z', ...over,
});

describe('inspiration references', () => {
  it('counts the posts learned from a page', () => {
    assert.equal(postsLearned(handle({ posts_cache: ['a', 'b'] })), 2);
    assert.equal(postsLearned(handle({ posts_cache: null })), 0);
  });

  it('rolls up the stat pills', () => {
    const stats = inspirationStats([
      handle({ id: 'a', posts_cache: ['1', '2', '3'] }),
      handle({ id: 'b' }),
      handle({ id: 'c', platform: 'instagram', posts_cache: ['1', '2'] }),
    ]);
    assert.deepEqual(stats, { references: 3, facebook: 2, instagram: 1, postsLearned: 5 });
  });

  it('names a reference by its display name, else its URL', () => {
    assert.equal(handleTitle(handle({ handle_name: '  Maruti Suzuki  ' })), 'Maruti Suzuki');
    assert.equal(handleTitle(handle({ handle_name: ' ' })), 'https://www.facebook.com/example');
  });

  it('suggests a URL for the chosen platform', () => {
    assert.equal(referencePlaceholder('facebook'), 'https://www.facebook.com/yourreference');
    assert.equal(referencePlaceholder('instagram'), 'https://www.instagram.com/yourreference');
  });

  it('treats only http(s) links as references', () => {
    assert.equal(isHttpUrl('https://www.instagram.com/kiaindia/'), true);
    assert.equal(isHttpUrl('http://example.com'), true);
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'www.facebook.com/page', '']) {
      assert.equal(isHttpUrl(bad), false, bad);
    }
  });
});
