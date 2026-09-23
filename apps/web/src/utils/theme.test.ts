import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THEME_MODE, THEME_STORAGE_KEY, isDarkMode, parseThemeMode } from './theme';

describe('theme mode', () => {
  it('uses the themeMode storage key and defaults to light in Stage A', () => {
    assert.equal(THEME_STORAGE_KEY, 'themeMode');
    assert.equal(DEFAULT_THEME_MODE, 'light');
  });

  it('accepts only known modes', () => {
    assert.equal(parseThemeMode('dark'), 'dark');
    assert.equal(parseThemeMode('system'), 'system');
    assert.equal(parseThemeMode('light'), 'light');
    assert.equal(parseThemeMode('DARK'), 'light');
    assert.equal(parseThemeMode(null), 'light');
    assert.equal(parseThemeMode(undefined), 'light');
  });

  it('resolves dark for dark, and for system only when the OS prefers dark', () => {
    assert.equal(isDarkMode('dark', false), true);
    assert.equal(isDarkMode('light', true), false);
    assert.equal(isDarkMode('system', true), true);
    assert.equal(isDarkMode('system', false), false);
  });
});
