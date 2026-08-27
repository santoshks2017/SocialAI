import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPrice,
  formatCurrency,
  formatNumber,
  classNames,
  truncate,
  getInitials,
  capitalize,
  slugify,
  formatRelativeTime,
} from './helpers.js';

describe('Frontend Helpers (apps/web/src/utils/helpers.ts)', () => {
  describe('formatPrice (Indian Rupee system)', () => {
    it('formats amounts in Crores (Cr) when >= 1 Crore (10,000,000)', () => {
      assert.equal(formatPrice(15000000), '₹1.50 Cr');
      assert.equal(formatPrice(20000000), '₹2.00 Cr');
    });

    it('formats amounts in Lakhs (L) when >= 1 Lakh (100,000)', () => {
      assert.equal(formatPrice(1250000), '₹12.50 L');
      assert.equal(formatPrice(100000), '₹1.00 L');
      assert.equal(formatPrice(950000), '₹9.50 L');
    });

    it('formats amounts in thousands with Indian numbering format', () => {
      const formatted = formatPrice(50000);
      assert.ok(formatted.startsWith('₹'));
      assert.ok(formatted.includes('50'));
    });

    it('formats small amounts directly', () => {
      assert.equal(formatPrice(750), '₹750');
    });
  });

  describe('formatCurrency and formatNumber (compact mode)', () => {
    it('formats compact currency in Lakhs', () => {
      assert.equal(formatCurrency(250000, true), '₹2.5L');
    });

    it('formats compact numbers in Cr, L, and K', () => {
      assert.equal(formatNumber(12000000, true), '1.2Cr');
      assert.equal(formatNumber(450000, true), '4.5L');
      assert.equal(formatNumber(8500, true), '8.5K');
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "just now" for dates within the last minute', () => {
      const now = new Date();
      assert.equal(formatRelativeTime(now), 'just now');
    });

    it('returns "Xm ago" for dates within the past hour', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      assert.equal(formatRelativeTime(fiveMinutesAgo), '5m ago');
    });

    it('returns "Xh ago" for dates within the past day', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
      assert.equal(formatRelativeTime(threeHoursAgo), '3h ago');
    });
  });

  describe('classNames', () => {
    it('concatenates active class names and drops falsy or undefined values', () => {
      const result = classNames('btn', true && 'btn-primary', false && 'btn-danger', null, undefined, 'rounded-lg');
      assert.equal(result, 'btn btn-primary rounded-lg');
    });
  });

  describe('truncate', () => {
    it('truncates strings exceeding specified length with ellipsis', () => {
      assert.equal(truncate('Cardeko Social AI Dealership Platform', 15), 'Cardeko Social ...');
    });

    it('leaves strings within length limit untouched', () => {
      assert.equal(truncate('Creta SX', 15), 'Creta SX');
    });
  });

  describe('getInitials', () => {
    it('extracts two-letter initials from multi-word names', () => {
      assert.equal(getInitials('Apex Motors'), 'AM');
      assert.equal(getInitials('Shree Ram Automobiles India'), 'SI');
    });

    it('extracts first two letters from single-word names', () => {
      assert.equal(getInitials('Hyundai'), 'HY');
    });
  });

  describe('capitalize and slugify', () => {
    it('capitalizes the first letter', () => {
      assert.equal(capitalize('dealership'), 'Dealership');
    });

    it('creates URL-safe slugs from titles and vehicle names', () => {
      assert.equal(slugify('Hyundai Creta SX (O) Turbo!'), 'hyundai-creta-sx-o-turbo');
      assert.equal(slugify('Special Diwali Dhamaka 2026'), 'special-diwali-dhamaka-2026');
    });
  });
});
