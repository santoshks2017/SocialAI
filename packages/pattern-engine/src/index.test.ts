import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractPatterns } from './index.js';

describe('extractPatterns', () => {
  it('extracts image count correctly', () => {
    const res = extractPatterns({
      images: ['https://example.com/car1.jpg', 'https://example.com/car2.jpg'],
      text: 'Check out the new car!'
    });
    assert.equal(res.imageCount, 2);
  });

  it('handles empty images array gracefully', () => {
    const res = extractPatterns({
      images: [],
      text: 'No images here'
    });
    assert.equal(res.imageCount, 0);
  });

  describe('phone number detection', () => {
    it('detects a standard 10-digit Indian phone number', () => {
      const res = extractPatterns({
        images: [],
        text: 'Contact our sales team at 9876543210 for test drives'
      });
      assert.equal(res.hasPhone, true);
    });

    it('detects phone with +91 country code', () => {
      const res = extractPatterns({
        images: [],
        text: 'Call +91 9876543210 today!'
      });
      assert.equal(res.hasPhone, true);
    });

    it('detects phone with hyphens and spaces', () => {
      const res = extractPatterns({
        images: [],
        text: 'Helpline: 987-654-3210'
      });
      assert.equal(res.hasPhone, true);
    });

    it('returns false when no valid phone number is present', () => {
      const res = extractPatterns({
        images: [],
        text: 'Price starting at 12345 rupees only'
      });
      assert.equal(res.hasPhone, false);
    });
  });

  describe('festival keyword detection', () => {
    it('detects single festival keyword (Diwali)', () => {
      const res = extractPatterns({
        images: [],
        text: 'Huge Diwali Dhamaka Offer! Book now.'
      });
      assert.deepEqual(res.detectedFestivals, ['diwali']);
    });

    it('detects multiple festival keywords case-insensitively', () => {
      const res = extractPatterns({
        images: [],
        text: 'From Navratri to Dussehra, enjoy zero down payment!'
      });
      assert.deepEqual(res.detectedFestivals, ['navratri', 'dussehra']);
    });

    it('returns empty array when no festival is mentioned', () => {
      const res = extractPatterns({
        images: [],
        text: 'Regular weekend discount on all SUV models.'
      });
      assert.deepEqual(res.detectedFestivals, []);
    });
  });
});
