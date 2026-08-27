import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendTemplate,
  festivalOfferTemplate,
  minimalCleanTemplate,
  discountOfferTemplate,
  defaultTemplates
} from './index.js';

describe('template-engine', () => {
  describe('defaultTemplates catalog', () => {
    it('contains all standard template layouts', () => {
      assert.ok(defaultTemplates.festival_offer);
      assert.ok(defaultTemplates.discount_offer);
      assert.ok(defaultTemplates.minimal_clean);
    });

    it('defines valid layout positions', () => {
      assert.equal(festivalOfferTemplate.layout.logoPosition, 'top-left');
      assert.equal(festivalOfferTemplate.layout.carImagePosition, 'center');
      assert.equal(festivalOfferTemplate.layout.offerBadgePosition, 'top-right');

      assert.equal(discountOfferTemplate.layout.logoPosition, 'top-center');
      assert.equal(discountOfferTemplate.layout.offerBadgePosition, 'center');

      assert.equal(minimalCleanTemplate.layout.logoPosition, 'bottom-right');
      assert.equal(minimalCleanTemplate.layout.offerBadgePosition, 'none');
    });
  });

  describe('recommendTemplate', () => {
    it('recommends festivalOfferTemplate when festival name is provided', () => {
      const template = recommendTemplate({ festival: 'diwali' });
      assert.equal(template.id, 'festival_offer');
      assert.deepEqual(template, festivalOfferTemplate);
    });

    it('recommends minimalCleanTemplate when festival is not provided', () => {
      const template = recommendTemplate({});
      assert.equal(template.id, 'minimal_clean');
      assert.deepEqual(template, minimalCleanTemplate);
    });

    it('recommends minimalCleanTemplate when festival is only whitespace', () => {
      const template = recommendTemplate({ festival: '   ' });
      assert.equal(template.id, 'minimal_clean');
      assert.deepEqual(template, minimalCleanTemplate);
    });
  });
});
