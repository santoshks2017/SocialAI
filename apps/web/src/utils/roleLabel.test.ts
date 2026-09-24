import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_LABELS, roleLabel } from './roleLabel.js';

describe('roleLabel', () => {
  it('uses one vocabulary everywhere: Owner, Manager, Creator', () => {
    assert.deepEqual(ROLE_LABELS, { owner: 'Owner', admin: 'Manager', user: 'Creator' });
    assert.equal(roleLabel('user'), 'Creator');
    assert.equal(roleLabel('admin'), 'Manager');
    assert.equal(roleLabel('owner'), 'Owner');
  });

  it('shows unknown roles unchanged', () => {
    assert.equal(roleLabel('auditor'), 'auditor');
  });
});
