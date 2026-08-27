import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getBrandLogoSvg } from '../src/services/brandLogoService.js';

describe('Brand Logo Service (brandLogoService.ts)', () => {
  const brands = [
    { name: 'Maruti Suzuki', expectedText: 'MARUTI SUZUKI' },
    { name: 'Hyundai', expectedText: 'HYUNDAI' },
    { name: 'Tata Motors', expectedText: 'TATA' },
    { name: 'Honda', expectedText: 'HONDA' },
    { name: 'Toyota', expectedText: 'TOYOTA' },
    { name: 'Mahindra', expectedText: 'Mahindra' },
    { name: 'Kia', expectedText: 'KIA' },
  ];

  for (const { name, expectedText } of brands) {
    it(`generates valid SVG for brand: ${name}`, () => {
      const svg = getBrandLogoSvg(name, '#ffffff');

      assert.ok(svg.startsWith('<svg'), `SVG should start with <svg for ${name}`);
      assert.ok(svg.endsWith('</svg>'), `SVG should end with </svg> for ${name}`);
      assert.ok(svg.includes('viewBox="0 0 200 60"'), 'SVG should have standard 200x60 viewBox');
      assert.ok(svg.includes(expectedText), `SVG should include brand text ${expectedText}`);
      assert.ok(svg.includes('#ffffff'), 'SVG should apply the given accent color');
    });
  }

  it('generates a clean fallback SVG for an unlisted brand', () => {
    const svg = getBrandLogoSvg('CustomMotors', '#ff9900');

    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('CUSTOMMOTORS'));
    assert.ok(svg.includes('#ff9900'));
  });

  it('handles case-insensitive and trimmed brand input', () => {
    const svg = getBrandLogoSvg('   hYuNdAi   ');
    assert.ok(svg.includes('HYUNDAI'));
  });
});
