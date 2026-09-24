import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_THEME_MODE, THEME_STORAGE_KEY, isDarkMode, parseThemeMode, resolveThemeMode } from './theme.js';

describe('theme mode', () => {
  it('uses the themeMode storage key and follows the device by default', () => {
    assert.equal(THEME_STORAGE_KEY, 'themeMode');
    assert.equal(DEFAULT_THEME_MODE, 'system');
  });

  it('accepts only known modes', () => {
    assert.equal(parseThemeMode('dark'), 'dark');
    assert.equal(parseThemeMode('system'), 'system');
    assert.equal(parseThemeMode('light'), 'light');
    assert.equal(parseThemeMode('DARK'), 'system');
    assert.equal(parseThemeMode(null), 'system');
    assert.equal(parseThemeMode(undefined), 'system');
  });

  it('resolves dark for dark, and for system only when the OS prefers dark', () => {
    assert.equal(isDarkMode('dark', false), true);
    assert.equal(isDarkMode('light', true), false);
    assert.equal(isDarkMode('system', true), true);
    assert.equal(isDarkMode('system', false), false);
  });

  it('keeps the index.html pre-paint script in step: no saved choice follows the device', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.match(html, /localStorage\.getItem\('themeMode'\)/);
    assert.match(html, /if \(m !== 'light' && m !== 'dark'\) m = 'system';/);
    assert.match(html, /m === 'system' && window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches/);
  });
});

describe('resolveThemeMode', () => {
  it('applies a fetch that matches the signed-in user', () => {
    assert.equal(resolveThemeMode('user-a', { userId: 'user-a', mode: 'dark' }), 'dark');
  });

  it('falls back to the default when nothing has been fetched for this user yet', () => {
    assert.equal(resolveThemeMode('user-a', null), 'system');
  });

  it('switch-user: ignores a fetch tagged for a different account than the one signed in now', () => {
    assert.equal(resolveThemeMode('user-b', { userId: 'user-a', mode: 'dark' }), 'system');
  });

  it('signed-out: ignores any fetched value when no one is signed in', () => {
    assert.equal(resolveThemeMode(null, { userId: 'user-a', mode: 'dark' }), 'system');
    assert.equal(resolveThemeMode(null, null), 'system');
  });

  it('late-response: a fetch for the previous user that resolves after switching accounts is ignored', () => {
    // user-a's request was in flight when user-b signed in; it resolves afterwards, tagged user-a.
    assert.equal(resolveThemeMode('user-b', { userId: 'user-a', mode: 'light' }), 'system');
  });
});
