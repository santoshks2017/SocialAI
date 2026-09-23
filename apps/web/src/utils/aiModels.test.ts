import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { choiceFromStored, isModelId, storedFromChoice } from './aiModels.js';

const options = [{ id: 'gemini-3.8-flash' }, { id: 'gemini-3.5-flash' }];

describe('model choice helpers', () => {
  it('maps stored values to the select and back', () => {
    assert.deepEqual(choiceFromStored(null, options), { select: '', custom: '' });
    assert.deepEqual(choiceFromStored('gemini-3.5-flash', options), { select: 'gemini-3.5-flash', custom: '' });
    assert.deepEqual(choiceFromStored('gemini-3.9-flash', options), { select: 'other', custom: 'gemini-3.9-flash' });
    assert.equal(storedFromChoice('', 'ignored'), null);
    assert.equal(storedFromChoice('gemini-3.8-flash', ''), 'gemini-3.8-flash');
    assert.equal(storedFromChoice('other', ' gemini-3.9-flash '), 'gemini-3.9-flash');
    assert.equal(storedFromChoice('other', 'Not A Model'), 'invalid');
    assert.equal(isModelId('veo-3.1-generate-preview'), true);
  });
});
