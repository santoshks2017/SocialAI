import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_LANGUAGES, NOTIFICATION_OPTIONS, NOTIFICATION_TYPES, allNotificationsOn, normaliseLanguages, toggleLanguage } from './preferences.js';

describe('preferences', () => {
  it('labels every notification type the API sends', () => {
    assert.deepEqual(NOTIFICATION_OPTIONS.map((o) => o.type), [...NOTIFICATION_TYPES]);
    assert.equal(NOTIFICATION_TYPES.length, 7);
    assert.ok(Object.values(allNotificationsOn()).every((on) => on === true));
  });

  it('offers the languages captions can be written in', () => {
    assert.deepEqual(CONTENT_LANGUAGES.map((l) => l.code), ['en', 'hi', 'mr', 'ta', 'te', 'kn', 'gu', 'bn']);
  });

  it('keeps supported languages in order, English always included', () => {
    assert.deepEqual(normaliseLanguages(['hi', 'ml', 'en']), ['hi', 'en']);
    assert.deepEqual(normaliseLanguages(['ta']), ['ta', 'en']);
    assert.deepEqual(normaliseLanguages(['en', 'en', 'gu']), ['en', 'gu']);
    assert.deepEqual(normaliseLanguages(null), ['en']);
  });

  it('toggles a language but never removes English', () => {
    assert.deepEqual(toggleLanguage(['en'], 'bn'), ['en', 'bn']);
    assert.deepEqual(toggleLanguage(['en', 'bn'], 'bn'), ['en']);
    assert.deepEqual(toggleLanguage(['hi', 'en'], 'en'), ['hi', 'en']);
  });
});
