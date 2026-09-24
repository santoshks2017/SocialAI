import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PROFILE_FORM, addBrand, profileChanged, profileFormValues, profileUpdateBody, resolveSettingsTab, usesProfile, visibleSettingsTabs,
  type StoredDealerProfile,
} from './settings.js';

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

describe('the shared profile form', () => {
  const stored: StoredDealerProfile = {
    name: 'Sharma Motors', city: 'Pune', contact_phone: '+91 98765 43210', brands: ['Hyundai'],
    language_preferences: ['hi', 'en'], region: 'West India', showroom_type: ['pre-owned'], use_brand_theme: true, primary_color: '#c2564f',
  };

  it('loads only on the tabs that use it', () => {
    assert.deepEqual(visibleSettingsTabs(everyone).filter((t) => usesProfile(t.id)).map((t) => t.id), ['profile', 'preferences', 'model_library']);
  });

  it('fills fields the profile lacks with the form defaults', () => {
    const v = profileFormValues(stored);
    assert.deepEqual([v.dealerName, v.phone, v.whatsapp, v.font, v.showroomType, v.selectedLangs], ['Sharma Motors', '+91 98765 43210', '', 'Arial', 'pre-owned', ['hi', 'en']]);
    assert.deepEqual(profileFormValues({ name: '', city: '' }), { ...EMPTY_PROFILE_FORM });
  });

  it('builds the PUT body, leaving out an unset secondary colour', () => {
    const body = profileUpdateBody(profileFormValues(stored));
    assert.equal(body['region'], 'West India');
    assert.deepEqual(body['showroom_type'], ['pre-owned']);
    assert.equal('secondary_color' in body, false);
  });

  it('changes the dealer profile only when a dealer field changed', () => {
    const loaded = profileFormValues(stored);
    // A notification-only save leaves the form as loaded: no PUT /dealer/profile.
    assert.equal(profileChanged({ ...loaded }, loaded), false);
    assert.equal(profileChanged({ ...loaded, selectedRegion: 'Kerala' }, loaded), true);
    assert.equal(profileChanged({ ...loaded, selectedLangs: ['hi', 'en', 'ta'] }, loaded), true);
    assert.equal(profileChanged({ ...loaded, dealerName: 'Sharma Cars' }, loaded), true);
    // Before the profile loads there is nothing to change.
    assert.equal(profileChanged(EMPTY_PROFILE_FORM, null), false);
  });
});
