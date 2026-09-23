import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roleLabel } from './roleLabel';

describe('roleLabel', () => {
  it('uses the reference badge copy', () => {
    assert.equal(roleLabel('user'), 'Creator');
    assert.equal(roleLabel('admin'), 'Manager');
    assert.equal(roleLabel('owner'), 'Owner');
  });

  it('shows unknown roles unchanged', () => {
    assert.equal(roleLabel('auditor'), 'auditor');
  });
});
