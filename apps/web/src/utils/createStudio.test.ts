import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  accountSelection, addHashtag, connectedPlatformIds, dealerInitials, defaultPlatforms, deliveryRows, initialLanguage, instagramHandle, keepPreloadedCaption,
  limitIssues, limitMessage, mergeHashtags, outputFormat, outputFormatNote, parseAspect, platformAccounts, platformOptions, reelErrorMessage, reelHandle,
  scheduleFromQuery, selectedConnectionIds, shouldFallBackToQuickRender, toggleAccount, togglePlatform, truncateText, type FormatSpec, type PlatformSpecs,
} from './createStudio.js';

const spec = (overrides: Partial<FormatSpec>): FormatSpec => ({
  supported: true, aspectRatio: '1:1', size: '', maxDurationSec: null, maxFileMb: null,
  captionMaxChars: null, hashtagsMax: null, captionNote: '', hashtagsRecommended: '', ...overrides,
});

const specs: PlatformSpecs = {
  facebook: { post: spec({ aspectRatio: '1:1, 4:5', captionMaxChars: 100, hashtagsMax: 3 }), reel: spec({ aspectRatio: '9:16' }) },
  gmb: { post: spec({ aspectRatio: '4:3', captionMaxChars: 1500, hashtagsMax: 10 }) },
  common: { post: spec({ aspectRatio: '1:1' }), reel: spec({ aspectRatio: '9:16' }) },
};

describe('language and platforms', () => {
  it("starts from the dealer’s first supported language", () => {
    assert.equal(initialLanguage(['ta', 'en']), 'ta');
    assert.equal(initialLanguage(['xx']), 'en');
    assert.equal(initialLanguage(null), 'en');
  });

  it("offers only connected platforms, in the type’s order", () => {
    const connected = ['instagram', 'youtube', 'gmb'];
    assert.deepEqual(platformOptions('image', connected).map((p) => p.id), ['instagram', 'gmb', 'youtube']);
    assert.deepEqual(defaultPlatforms('reel', connected), ['youtube', 'instagram']);
    assert.deepEqual(togglePlatform(['facebook'], 'gmb'), ['facebook', 'gmb']);
    assert.deepEqual(togglePlatform(['facebook', 'gmb'], 'facebook'), ['gmb']);
  });
});

describe('accounts per platform', () => {
  const accounts = [
    { id: 'fb-new', platform: 'facebook', accountName: 'Apex Used', createdAt: '2026-09-02T00:00:00.000Z' },
    { id: 'fb-old', platform: 'facebook', accountName: 'Apex Motors', createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 'g-1', platform: 'google', accountName: 'Apex Bandra', createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 'yt-1', platform: 'youtube', accountName: 'Apex TV', createdAt: '2026-09-03T00:00:00.000Z' },
  ];

  it('lists connected platforms with Google as gmb, and each platform primary first', () => {
    assert.deepEqual(connectedPlatformIds(accounts), ['facebook', 'gmb', 'youtube']);
    assert.deepEqual(platformAccounts(accounts, 'facebook').map((a) => a.id), ['fb-old', 'fb-new']);
  });

  it('offers account chips only where a platform has several accounts, with the primary preselected', () => {
    assert.deepEqual(accountSelection(accounts, ['facebook', 'gmb'], null), { facebook: ['fb-old'] });
    assert.deepEqual(accountSelection(accounts, ['facebook'], ['fb-new', 'g-1']), { facebook: ['fb-new'] });
    assert.deepEqual(accountSelection(accounts, ['gmb'], ['fb-new']), {});
  });

  it('keeps at least one account selected per platform', () => {
    assert.deepEqual(toggleAccount({ facebook: ['fb-old'] }, 'facebook', 'fb-new'), ['fb-old', 'fb-new']);
    assert.deepEqual(toggleAccount({ facebook: ['fb-old'] }, 'facebook', 'fb-old'), ['fb-old']);
    assert.deepEqual(toggleAccount({ facebook: ['fb-old', 'fb-new'] }, 'facebook', 'fb-old'), ['fb-new']);
    assert.deepEqual(selectedConnectionIds({ facebook: ['fb-old', 'fb-new'], instagram: ['ig-2'] }), ['fb-old', 'fb-new', 'ig-2']);
  });

  it('shows YouTube as a disabled chip on image posts', () => {
    assert.deepEqual(platformOptions('image', ['facebook', 'youtube']).find((o) => o.id === 'youtube'), {
      id: 'youtube', label: 'YouTube', disabled: true, hint: 'YouTube takes video (Shorts) only',
    });
    assert.deepEqual(defaultPlatforms('image', ['facebook', 'youtube']), ['facebook']);
    assert.equal(platformOptions('reel', ['youtube'])[0]?.disabled, undefined);
  });
});

describe('output format and limits', () => {
  it('reads the first aspect ratio of a spec', () => {
    assert.equal(parseAspect('1:1, 4:5'), '1:1');
    assert.equal(parseAspect('4:3/1:1'), '4:3');
    assert.equal(parseAspect('square'), null);
    assert.equal(parseAspect(undefined), null);
  });

  it("uses a single platform’s format, otherwise the common one", () => {
    assert.equal(outputFormat('image', ['gmb'], specs), '4:3');
    assert.equal(outputFormat('image', ['facebook', 'gmb'], specs), '1:1');
    assert.equal(outputFormat('image', ['instagram'], specs), '1:1');
    assert.equal(outputFormat('reel', [], null), '9:16');
    assert.equal(outputFormatNote(['gmb']), '— configured for Google.');
    assert.equal(outputFormatNote(['facebook', 'gmb']), '— common format for the selected platforms.');
  });

  it("flags captions and hashtags over a platform’s limits", () => {
    const issues = limitIssues('image', ['facebook', 'gmb'], specs, 'x'.repeat(101), ['#a', '#b', '#c', '#d']);
    assert.deepEqual(issues, [{ platform: 'facebook', label: 'Facebook', captionOver: true, hashtagsOver: true }]);
    assert.equal(limitMessage(issues[0]!), 'Facebook: caption too long · too many hashtags.');
    assert.deepEqual(limitIssues('image', ['facebook'], null, 'x'.repeat(500), []), []);
  });

  it('measures the caption as platforms receive it, with the hashtags appended', () => {
    // 90 + 2 (blank line) + '#ab #cd'.length (7) = 99, within Facebook's 100 here.
    assert.deepEqual(limitIssues('image', ['facebook'], specs, 'x'.repeat(90), ['#ab', '#cd']), []);
    // 92 + 2 + 7 = 101
    assert.deepEqual(limitIssues('image', ['facebook'], specs, 'x'.repeat(92), ['#ab', '#cd']),
      [{ platform: 'facebook', label: 'Facebook', captionOver: true, hashtagsOver: false }]);
    assert.deepEqual(limitIssues('image', ['facebook'], specs, 'x'.repeat(100), []), []);
  });
});

describe('dealer display helpers', () => {
  it('builds initials and handles', () => {
    assert.equal(dealerInitials('Sharma Auto World'), 'SA');
    assert.equal(dealerInitials(''), 'CD');
    assert.equal(dealerInitials(undefined), 'CD');
    assert.equal(instagramHandle('Sharma Auto World!'), 'sharma_auto_world');
    assert.equal(reelHandle('Sharma Auto World!'), '@sharmaautoworld');
    assert.equal(truncateText('abcdef', 3), 'abc…');
    assert.equal(truncateText('ab', 3), 'ab');
  });
});

describe('hashtags', () => {
  it('adds normalized tags once, case-insensitively', () => {
    assert.deepEqual(addHashtag(['#Creta'], ' ##creta '), ['#Creta']);
    assert.deepEqual(addHashtag(['#Creta'], 'SUV'), ['#Creta', '#SUV']);
    assert.deepEqual(addHashtag([], '   '), []);
    assert.deepEqual(mergeHashtags(['#A'], ['b', '#a', 'c'], 2), ['#A', '#b']);
  });
});

describe('reel errors', () => {
  it('explains error codes and falls back only from Veo', () => {
    assert.equal(reelErrorMessage('VEO_QUOTA_EXCEEDED'), 'Video generation quota reached. Try again later.');
    assert.equal(reelErrorMessage('REEL_DAILY_LIMIT_REACHED'), "You’ve reached today’s reel limit. Try again tomorrow.");
    assert.equal(reelErrorMessage(undefined), 'Could not generate. Please try again.');
    assert.equal(shouldFallBackToQuickRender('VEO_QUOTA_EXCEEDED', 'veo'), true);
    assert.equal(shouldFallBackToQuickRender('VEO_QUOTA_EXCEEDED', 'kenburns'), false);
    assert.equal(shouldFallBackToQuickRender('GENERATION_FAILED', 'veo'), false);
  });
});

describe('deliveryRows', () => {
  it('reports each platform as live, failed or still uploading', () => {
    const post = { status: 'publishing', publish_results: { facebook: { url: 'https://fb.test/v/1' }, instagram: { error: 'Reel rejected' }, _rejection: { reason: 'x' } } };
    assert.deepEqual(deliveryRows(['facebook', 'instagram', 'youtube'], post), [
      { platform: 'facebook', status: 'live', url: 'https://fb.test/v/1' },
      { platform: 'instagram', status: 'failed', url: null },
      { platform: 'youtube', status: 'uploading', url: null },
    ]);
  });

  it('treats a published post without a link as live', () => {
    assert.deepEqual(deliveryRows(['facebook'], { status: 'published', publish_results: {} }), [{ platform: 'facebook', status: 'live', url: null }]);
    assert.deepEqual(deliveryRows(['facebook'], null), [{ platform: 'facebook', status: 'uploading', url: null }]);
  });
});

describe('scheduleFromQuery', () => {
  it("pre-fills the schedule from the calendar’s date and time", () => {
    assert.equal(scheduleFromQuery('2026-10-02', '18:30'), '2026-10-02T18:30');
    assert.equal(scheduleFromQuery('2026-10-02', null), '2026-10-02T10:00');
    assert.equal(scheduleFromQuery('2026-10-02', '6pm'), '2026-10-02T10:00');
    assert.equal(scheduleFromQuery('tomorrow', '18:30'), '');
    assert.equal(scheduleFromQuery(null, null), '');
  });
});

describe('keepPreloadedCaption', () => {
  it('keeps a drafted caption on the first generate in edit mode only', () => {
    assert.equal(keepPreloadedCaption({ editing: true, currentCaption: 'Thank you Asha!', hasResult: false }), true);
    assert.equal(keepPreloadedCaption({ editing: true, currentCaption: 'Thank you Asha!', hasResult: true }), false);
    assert.equal(keepPreloadedCaption({ editing: true, currentCaption: '  ', hasResult: false }), false);
    assert.equal(keepPreloadedCaption({ editing: false, currentCaption: 'Thank you Asha!', hasResult: false }), false);
  });
});
