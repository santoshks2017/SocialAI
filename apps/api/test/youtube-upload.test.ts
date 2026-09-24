import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios, { AxiosError, type AxiosResponse } from 'axios';
import { prisma } from '../src/db/prisma.js';
import { publishPost } from '../src/lib/publishDirect.js';
import {
  YOUTUBE_EXPIRED_MESSAGE, YOUTUBE_LIMIT_MESSAGE, reelSource, shortsDescription, shortsTags, shortsTitle, uploadShort, youtubeErrorMessage,
} from '../src/lib/youtubeUpload.js';

const apiError = (status: number, reason: string, message = 'Request failed') =>
  new AxiosError(message, 'ERR_BAD_REQUEST', undefined, undefined, {
    status, statusText: '', headers: {}, config: {}, data: { error: { code: status, message, errors: [{ reason }] } },
  } as unknown as AxiosResponse);

const UPLOAD = { accessToken: 'ya29.token', videoUrl: 'https://storage.googleapis.com/bucket/reels/r1.mp4', title: 'Creta walkaround #Shorts', description: 'Book a test drive', tags: ['Creta'] };

describe('Shorts metadata', () => {
  it('builds the title from the first caption line, without hashtags or angle brackets', () => {
    assert.equal(shortsTitle('New <Creta> is here #Hyundai #SUV\nVisit us', 'Apex Motors'), 'New Creta is here #Shorts');
    assert.equal(shortsTitle('#Diwali #Offers', 'Apex Motors'), 'Apex Motors #Shorts');
    const long = shortsTitle('x'.repeat(150), 'Apex');
    assert.equal(long.length, 100);
    assert.ok(long.endsWith(' #Shorts'));
  });

  it('keeps the description under 5000 characters and drops angle brackets', () => {
    assert.equal(shortsDescription('Book <now>\n\n#Creta'), 'Book now\n\n#Creta');
    assert.equal(shortsDescription('x'.repeat(6000)).length, 5000);
  });

  it('turns hashtags into tags within 500 characters', () => {
    assert.deepEqual(shortsTags(['#Creta', 'creta', ' #SUV ', '#', '<b>']), ['Creta', 'SUV', 'b']);
    const many = shortsTags(Array.from({ length: 60 }, (_, i) => `#tag${String(i).padStart(6, '0')}`));
    assert.ok(many.join(',').length <= 500);
    assert.ok(many.length < 60);
  });

  it('truncates an emoji-heavy title by code point, never splitting a surrogate pair', () => {
    const car = '\u{1F697}'; // astral-plane emoji: 2 UTF-16 code units, 1 code point
    const title = shortsTitle('X' + car.repeat(120), 'Dealer');
    assert.equal(title.isWellFormed(), true);
    assert.equal(Array.from(title).length, 100);
    assert.ok(title.endsWith(' #Shorts'));
  });

  it('truncates an emoji-heavy description by code point, never splitting a surrogate pair', () => {
    const face = '\u{1F600}'; // astral-plane emoji
    const description = shortsDescription(face.repeat(6000));
    assert.equal(description.isWellFormed(), true);
    assert.equal(Array.from(description).length, 5000);
  });
});

describe('uploadShort', () => {
  it('starts a resumable session, then uploads the bytes', async (t) => {
    const bytes = Buffer.from('fake-mp4-bytes');
    t.mock.method(reelSource, 'load', async () => bytes);
    const post = t.mock.method(axios, 'post', async (_url: string, _body: unknown, _config: unknown) => ({
      headers: { location: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=abc' }, data: {},
    }));
    const put = t.mock.method(axios, 'put', async (_url: string, _body: unknown, _config: unknown) => ({ data: { id: 'short-1' } }));

    const result = await uploadShort(UPLOAD);

    assert.deepEqual(result, { platform_post_id: 'short-1', url: 'https://youtube.com/shorts/short-1' });
    const [initUrl, initBody, initConfig] = post.mock.calls[0]!.arguments;
    assert.equal(initUrl, 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status');
    assert.deepEqual(initBody, {
      snippet: { title: 'Creta walkaround #Shorts', description: 'Book a test drive', tags: ['Creta'], categoryId: '2' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    });
    const initHeaders = (initConfig as { headers: Record<string, string> }).headers;
    assert.deepEqual(
      [initHeaders['Authorization'], initHeaders['X-Upload-Content-Type'], initHeaders['X-Upload-Content-Length']],
      ['Bearer ya29.token', 'video/mp4', String(bytes.length)],
    );
    const [putUrl, putBody, putConfig] = put.mock.calls[0]!.arguments;
    assert.equal(putUrl, 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=abc');
    assert.equal(putBody, bytes);
    assert.equal((putConfig as { timeout: number }).timeout, 120_000);
  });

  it('maps YouTube errors to plain copy', async (t) => {
    assert.equal(youtubeErrorMessage(apiError(403, 'quotaExceeded')), YOUTUBE_LIMIT_MESSAGE);
    assert.equal(youtubeErrorMessage(apiError(400, 'uploadLimitExceeded')), YOUTUBE_LIMIT_MESSAGE);
    assert.equal(youtubeErrorMessage(apiError(401, 'youtubeSignupRequired')), 'This Google account has no YouTube channel. Create one on YouTube, then connect again.');
    assert.equal(youtubeErrorMessage(apiError(401, 'authError')), YOUTUBE_EXPIRED_MESSAGE);
    assert.equal(youtubeErrorMessage(apiError(400, 'invalidTitle', 'The title is invalid.')), 'The title is invalid.');
    assert.equal(youtubeErrorMessage(new Error('socket hang up')), 'socket hang up');
    assert.equal(YOUTUBE_LIMIT_MESSAGE, "YouTube's daily upload limit was reached. Try again tomorrow.");

    t.mock.method(reelSource, 'load', async () => Buffer.from('x'));
    t.mock.method(axios, 'post', async () => { throw apiError(403, 'quotaExceeded'); });
    await assert.rejects(uploadShort(UPLOAD), { message: YOUTUBE_LIMIT_MESSAGE });
  });

  it('never calls YouTube for a mock channel', async (t) => {
    const load = t.mock.method(reelSource, 'load', async () => Buffer.from('x'));
    const post = t.mock.method(axios, 'post', async () => ({ data: {} }));

    const result = await uploadShort({ ...UPLOAD, accessToken: 'mock_youtube_access_token' });

    assert.match(result.url, /^https:\/\/youtube\.com\/shorts\/mock_yt_short_/);
    assert.equal(load.mock.callCount() + post.mock.callCount(), 0);
  });

  it('gives a clear error when the init response has no upload address', async (t) => {
    t.mock.method(reelSource, 'load', async () => Buffer.from('x'));
    t.mock.method(axios, 'post', async () => ({ headers: {}, data: {} }));

    await assert.rejects(uploadShort(UPLOAD), { message: 'YouTube did not return an upload address.' });
  });

  it('gives a clear error when the upload response has no video id', async (t) => {
    t.mock.method(reelSource, 'load', async () => Buffer.from('x'));
    t.mock.method(axios, 'post', async () => ({ headers: { location: 'https://upload.test/session-1' }, data: {} }));
    t.mock.method(axios, 'put', async () => ({ data: {} }));

    await assert.rejects(uploadShort(UPLOAD), { message: 'YouTube did not return a video id.' });
  });
});

describe('publishPost to YouTube', () => {
  it('uploads a reel as a Short with a title from the caption', async (t) => {
    const dealer = await prisma.dealer.create({ data: { name: 'Apex Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
    await prisma.platformConnection.create({
      data: {
        dealer_id: dealer.id, platform: 'youtube', platform_account_id: 'UC-apex', platform_account_name: 'Apex TV',
        access_token: 'ya29.live', refresh_token: '1//r', token_expires_at: new Date(Date.now() + 3_600_000), is_connected: true,
      },
    });
    const post = await prisma.post.create({
      data: {
        dealer_id: dealer.id, prompt_text: 'Reel', caption_text: 'Creta walkaround', caption_hashtags: ['#Creta'], platforms: ['youtube'],
        status: 'publishing', media_type: 'video', video_url: 'https://storage.googleapis.com/bucket/reels/r1.mp4',
      },
    });
    t.mock.method(reelSource, 'load', async () => Buffer.from('mp4'));
    const init = t.mock.method(axios, 'post', async (_url: string, _body: unknown, _config: unknown) => ({ headers: { location: 'https://upload.test/session-1' }, data: {} }));
    t.mock.method(axios, 'put', async () => ({ data: { id: 'vid-9' } }));

    const outcome = await publishPost(post, ['youtube']);

    assert.equal(outcome.status, 'published');
    assert.equal(outcome.results[0]?.url, 'https://youtube.com/shorts/vid-9');
    const body = init.mock.calls[0]!.arguments[1] as { snippet: { title: string; description: string; tags: string[] } };
    assert.deepEqual([body.snippet.title, body.snippet.description, body.snippet.tags], ['Creta walkaround #Shorts', 'Creta walkaround\n\n#Creta', ['Creta']]);
  });
});
