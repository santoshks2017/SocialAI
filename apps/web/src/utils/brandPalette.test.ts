import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DARK_INK, DARK_SURFACE, MIN_CONTRAST, SHADES, brandPalette, brandThemeCss, contrastRatio, hexToHsl, hslToHex, parseHex, resolveBrandColor } from './brandPalette.js';

function channels(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

describe('brand palette', () => {
  it('parses 3- and 6-digit hex and nothing else', () => {
    assert.equal(parseHex('#1877F2'), '#1877f2');
    assert.equal(parseHex('abc'), '#aabbcc');
    assert.equal(parseHex('blue'), null);
    assert.equal(parseHex(''), null);
    assert.equal(parseHex(null), null);
  });

  it('round-trips through HSL', () => {
    for (const hex of ['#1877f2', '#c2564f', '#10b981', '#000000', '#ffffff']) {
      const back = channels(hslToHex(hexToHsl(hex)));
      channels(hex).forEach((c, i) => assert.ok(Math.abs(c - back[i]!) <= 1, `${hex} channel ${i}`));
    }
  });

  it("keeps the brand colour's hue on every shade", () => {
    const palette = brandPalette('#1877F2')!;
    const hue = hexToHsl('#1877f2').h;
    for (const shade of SHADES) {
      const { h, s } = hexToHsl(palette.light[shade]);
      if (s > 10) assert.ok(Math.abs(h - hue) < 4, `${shade}: ${h}`);
    }
  });

  it('keeps text readable on and beside the brand colour, light and dark', () => {
    for (const color of ['#1877F2', '#FFD700', '#00FF00', '#c2564f', '#111111', '#f5f5f5', '#7c3aed']) {
      const p = brandPalette(color)!;
      assert.ok(contrastRatio(p.light[600], '#ffffff') >= MIN_CONTRAST, `${color}: white on light 600`);
      assert.ok(contrastRatio(p.light[700], p.light[50]) >= MIN_CONTRAST, `${color}: light 700 on 50`);
      assert.ok(contrastRatio(p.dark[600], DARK_INK) >= MIN_CONTRAST, `${color}: dark ink on dark 600`);
      assert.ok(contrastRatio(p.dark[600], DARK_SURFACE) >= MIN_CONTRAST, `${color}: dark 600 on the dark surface`);
    }
  });

  it('builds light and dark rules that outrank index.css, and never touches amber', () => {
    const css = brandThemeCss('#1877F2')!;
    assert.match(css, /^:root:not\(\.dark\)\{--color-orange-50:#[0-9a-f]{6};/);
    assert.match(css, /:root\.dark\{--color-orange-50:#[0-9a-f]{6};/);
    assert.match(css, /--color-brand:#[0-9a-f]{6};--color-brand-hover:#[0-9a-f]{6};--color-brand-subtle:#[0-9a-f]{6}/);
    assert.ok(!css.includes('amber'));
    assert.equal(brandThemeCss('not a colour'), null);
    assert.equal(brandThemeCss(null), null);
  });
});

describe('resolveBrandColor', () => {
  const profile = { id: 'dealer-a', use_brand_theme: true, primary_color: '#1877F2' };

  it('applies the colour when the profile belongs to the signed-in dealer and the toggle is on', () => {
    assert.equal(resolveBrandColor(profile, 'dealer-a'), '#1877F2');
  });

  it("ignores a profile left over from a previous dealer's session (sign-out/sign-in without a reload)", () => {
    assert.equal(resolveBrandColor(profile, 'dealer-b'), null);
    assert.equal(resolveBrandColor(profile, null), null);
    assert.equal(resolveBrandColor(profile, undefined), null);
  });

  it('returns null when the toggle is off or there is no profile yet', () => {
    assert.equal(resolveBrandColor({ ...profile, use_brand_theme: false }, 'dealer-a'), null);
    assert.equal(resolveBrandColor(null, 'dealer-a'), null);
  });
});
