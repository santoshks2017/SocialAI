import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addBrand, resolveSettingsTab, visibleSettingsTabs } from './settings.js';

const everyone = { manageTeam: true, viewBilling: true };

describe('settings tabs', () => {
  it('follows the reference order with Model Library last', () => {
    assert.deepEqual(visibleSettingsTabs(everyone).map((t) => t.id), ['profile', 'platforms', 'preferences', 'billing', 'inspiration', 'team', 'model_library']);
    assert.deepEqual(visibleSettingsTabs(everyone).map((t) => t.label), ['Business Profile', 'Platforms', 'Preferences', 'Billing', 'Inspiration', 'Team', 'Model Library']);
  });

  it('shows Team only to people who manage the team', () => {
    assert.ok(!visibleSettingsTabs({ ...everyone, manageTeam: false }).some((t) => t.id === 'team'));
  });

  it('shows Billing only to people who can view billing', () => {
    assert.ok(!visibleSettingsTabs({ ...everyone, viewBilling: false }).some((t) => t.id === 'billing'));
    assert.equal(resolveSettingsTab('billing', visibleSettingsTabs({ ...everyone, viewBilling: false })), 'profile');
  });

  it('opens the tab named in the URL only when the viewer can see it', () => {
    const tabs = visibleSettingsTabs({ manageTeam: false, viewBilling: false });
    assert.equal(resolveSettingsTab('platforms', tabs), 'platforms');
    assert.equal(resolveSettingsTab('inspiration', tabs), 'inspiration');
    assert.equal(resolveSettingsTab('team', tabs), 'profile');
    assert.equal(resolveSettingsTab('nonsense', tabs), 'profile');
    assert.equal(resolveSettingsTab(null, tabs), 'profile');
  });
});

describe('brands & categories', () => {
  it('adds trimmed names once, ignoring case and blanks', () => {
    assert.deepEqual(addBrand(['Hyundai'], '  Kia  '), ['Hyundai', 'Kia']);
    assert.deepEqual(addBrand(['Hyundai'], 'hyundai'), ['Hyundai']);
    assert.deepEqual(addBrand(['Hyundai'], '   '), ['Hyundai']);
    assert.deepEqual(addBrand([], 'Pre-owned   SUVs'), ['Pre-owned SUVs']);
  });
});
