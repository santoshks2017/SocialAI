import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from '../src/services/autoReplyEngine.js';

describe('Auto-Reply Engine (autoReplyEngine.ts)', () => {
  describe('renderTemplate', () => {
    const mockDealer = {
      name: 'Apex Hyundai Motors',
      city: 'Jaipur',
      phone: '+91 98765 43210',
      contact_phone: '+91 98765 43210',
      whatsapp_number: '+91 98765 43210',
    };

    const mockMessage = {
      customer_name: 'Rahul Sharma',
      message_text: 'Is the new Creta available in Knight Edition?',
      email_subject: 'Creta Enquiry',
    };

    it('interpolates all dealer and customer placeholders', () => {
      const template = 'Hi {{customer_name}}, thank you for reaching out to {{dealer_name}} in {{city}}! Call us at {{phone}} or WhatsApp {{whatsapp}}. Subject: {{email_subject}}';
      const rendered = renderTemplate(template, mockMessage, mockDealer);

      assert.equal(
        rendered,
        'Hi Rahul Sharma, thank you for reaching out to Apex Hyundai Motors in Jaipur! Call us at +91 98765 43210 or WhatsApp +91 98765 43210. Subject: Creta Enquiry'
      );
    });

    it('falls back to default values when fields are missing', () => {
      const emptyMessage = {};
      const emptyDealer = {};

      const template = 'Hello {{customer_name}} from {{dealer_name}}!';
      const rendered = renderTemplate(template, emptyMessage, emptyDealer);

      assert.equal(rendered, 'Hello Customer from !');
    });

    it('leaves text without placeholders untouched', () => {
      const plainText = 'Standard response with no variables.';
      const rendered = renderTemplate(plainText, mockMessage, mockDealer);

      assert.equal(rendered, plainText);
    });
  });
});
