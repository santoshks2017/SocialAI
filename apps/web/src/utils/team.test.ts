import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { TeamMember } from '../services/users';
import {
  accountChanges, accountDraft, assignableRoles, avatarGradient, canChangeRole, canManageMember, canRemove, canToggleActive, initialOf, memberName, roleOptions,
  teamStats,
} from './team.js';

const member = (over: Partial<TeamMember>): TeamMember => ({
  id: 'm1', dealerId: 'd1', phone: '+91 90000 00001', name: 'Asha', role: 'user', permissions: {} as TeamMember['permissions'],
  customPermissions: null, isActive: true, createdAt: '2026-09-01T00:00:00Z', ...over,
});
// F4: the owner role option is offered only to the platform owner (no dealer_id) — a dealership's
// own Owner picks Manager or Creator, same as a Manager.
const platformOwner = { id: 'boss', role: 'owner' as const, dealer_id: null };
const dealerOwner = { id: 'dealer-boss', role: 'owner' as const, dealer_id: 'd1' };
const manager = { id: 'me', role: 'admin' as const, dealer_id: 'd1' };

describe('team helpers', () => {
  it('offers the owner role only to the platform owner; a dealership Owner or a Manager only Manager or Creator', () => {
    assert.deepEqual(assignableRoles(platformOwner), ['owner', 'admin', 'user']);
    assert.deepEqual(assignableRoles(dealerOwner), ['admin', 'user']);
    assert.deepEqual(assignableRoles(manager), ['admin', 'user']);
    assert.deepEqual(roleOptions(manager), [{ value: 'admin', label: 'Manager' }, { value: 'user', label: 'Creator' }]);
  });

  it("keeps a Manager's hands off Owners, and nobody acts on themselves", () => {
    assert.equal(canManageMember(manager, member({ role: 'owner' })), false);
    assert.equal(canManageMember(dealerOwner, member({ role: 'owner' })), true);
    assert.equal(canChangeRole(manager, member({ id: 'me', role: 'admin' })), false);
    assert.equal(canChangeRole(manager, member({ role: 'user' })), true);
    assert.equal(canRemove(dealerOwner, member({ role: 'owner' })), false);
    assert.equal(canRemove(manager, member({ id: 'me' })), false);
    assert.equal(canRemove(manager, member({})), true);
  });

  it('offers Deactivate and Remove only on rows the viewer can manage', () => {
    assert.equal(canToggleActive(manager, member({ role: 'owner' })), false);
    assert.equal(canToggleActive(manager, member({ id: 'me', role: 'admin' })), false);
    assert.equal(canToggleActive(manager, member({ role: 'user' })), true);
    assert.equal(canToggleActive(dealerOwner, member({ role: 'owner' })), true);
    assert.equal(canToggleActive(null, member({ role: 'user' })), false);
    assert.equal(canRemove(manager, member({ role: 'owner' })), false);
    assert.equal(canRemove(null, member({ role: 'user' })), false);
  });

  it('builds avatars and names', () => {
    assert.match(avatarGradient('Asha'), /^from-[a-z]+-400 to-[a-z]+-600$/);
    assert.equal(avatarGradient('Asha'), avatarGradient('Asha'));
    assert.equal(initialOf(member({ name: '' })), '+');
    assert.equal(memberName(member({ name: '  ' })), 'Unnamed');
  });

  it('counts the team', () => {
    const stats = teamStats([member({ role: 'owner' }), member({ role: 'admin' }), member({ role: 'user', isActive: false }), member({ role: 'user' })]);
    assert.deepEqual(stats, { members: 4, owners: 1, managers: 1, creators: 2, active: 3 });
  });

  it('sends only the account fields that changed', () => {
    const m = member({ name: 'Asha', email: 'asha@example.com' });
    assert.equal(accountChanges(m, accountDraft(m)), null);
    assert.deepEqual(accountChanges(m, { name: ' Asha K ', email: 'asha@example.com', phone: m.phone }), { name: 'Asha K' });
    assert.deepEqual(accountChanges(m, { name: 'Asha', email: '', phone: '+91 90000 00009' }), { email: '', phone: '+91 90000 00009' });
  });
});
