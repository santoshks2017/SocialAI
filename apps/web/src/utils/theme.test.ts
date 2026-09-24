import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_THEME_MODE, THEME_STORAGE_KEY, isDarkMode, parseThemeMode } from './theme.js';

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
