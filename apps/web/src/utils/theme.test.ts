import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_THEME_MODE, THEME_STORAGE_KEY, isDarkMode, parseThemeMode, savedThemeMode, themeSync, type ThemeMode } from './theme.js';

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

describe('themeSync', () => {
  const unchanged = (mode: ThemeMode) => ({ atRequest: mode, now: mode });

  it('applies the theme saved on the account over the device choice', () => {
    assert.deepEqual(themeSync('user-a', { userId: 'user-a', mode: 'dark' }, unchanged('light')), { action: 'apply', mode: 'dark' });
    assert.deepEqual(themeSync('user-a', { userId: 'user-a', mode: 'system' }, unchanged('dark')), { action: 'apply', mode: 'system' });
  });

  it('server null: keeps the device choice and saves it to the account', () => {
    assert.deepEqual(themeSync('user-a', { userId: 'user-a', mode: null }, unchanged('dark')), { action: 'save', mode: 'dark' });
    // After a switch the device theme was reset to the default, so that is what gets kept.
    assert.deepEqual(themeSync('user-a', { userId: 'user-a', mode: null }, unchanged('system')), { action: 'save', mode: 'system' });
  });

  it('ignores a fetch overtaken by a theme picked on this device while it was in flight', () => {
    assert.deepEqual(themeSync('user-a', { userId: 'user-a', mode: 'light' }, { atRequest: 'light', now: 'dark' }), { action: 'ignore' });
    assert.deepEqual(themeSync('user-a', { userId: 'user-a', mode: null }, { atRequest: 'system', now: 'dark' }), { action: 'ignore' });
  });

  it('switch-user: ignores a fetch tagged for a different account than the one signed in now', () => {
    assert.deepEqual(themeSync('user-b', { userId: 'user-a', mode: 'dark' }, unchanged('system')), { action: 'ignore' });
    assert.deepEqual(themeSync('user-b', { userId: 'user-a', mode: null }, unchanged('system')), { action: 'ignore' });
  });

  it('signed-out: ignores any fetched value when no one is signed in', () => {
    assert.deepEqual(themeSync(null, { userId: 'user-a', mode: 'dark' }, unchanged('system')), { action: 'ignore' });
  });

  it('late-response: a fetch for the previous user that resolves after switching accounts is ignored', () => {
    // user-a's request was in flight when user-b signed in; it resolves afterwards, tagged user-a.
    assert.deepEqual(themeSync('user-b', { userId: 'user-a', mode: 'light' }, unchanged('system')), { action: 'ignore' });
  });

  it('reads the saved theme, null when there is none', () => {
    assert.equal(savedThemeMode('dark'), 'dark');
    assert.equal(savedThemeMode('system'), 'system');
    assert.equal(savedThemeMode(null), null);
    assert.equal(savedThemeMode(undefined), null);
    assert.equal(savedThemeMode('DARK'), null);
  });
});
