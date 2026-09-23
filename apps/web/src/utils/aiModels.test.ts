import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { choiceFromStored, isModelId, keyTestToast, storedFromChoice } from './aiModels.js';

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

describe('keyTestToast', () => {
  const models = (...available: boolean[]) => available.map((a) => ({ available: a }));

  it('warns when the key works but a chosen model isn’t available to it', () => {
    assert.deepEqual(keyTestToast({ ok: true, detail: 'Omni isn’t listed.', source: 'saved', models: models(true, true, false) }), {
      type: 'warning', title: 'Key works — some models unavailable', message: 'Omni isn’t listed.',
    });
  });

  it('reports success when every model is available, and failure otherwise', () => {
    assert.deepEqual(keyTestToast({ ok: true, detail: 'All good.', source: 'saved', models: models(true, true, true) }), {
      type: 'success', title: 'Key works', message: 'All good.',
    });
    assert.deepEqual(keyTestToast({ ok: false, detail: 'Key rejected.', source: 'saved', models: models(false) }), {
      type: 'error', title: 'Key test failed', message: 'Key rejected.',
    });
  });

  it('says when the server key was the one tested', () => {
    assert.equal(keyTestToast({ ok: true, detail: 'All good.', source: 'env', models: [] }).message, "All good. (Tested the server's GEMINI_API_KEY.)");
  });
});
