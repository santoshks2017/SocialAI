import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSIONS,
  ROLES,
  ROLE_DEFAULTS,
  resolvePermissions,
  can,
  type JwtUser
} from '../src/lib/permissions.js';

describe('Permissions & RBAC (permissions.ts)', () => {
  describe('ROLE_DEFAULTS', () => {
    it('grants full permissions to owner and admin roles', () => {
      for (const perm of Object.values(PERMISSIONS)) {
        assert.equal(ROLE_DEFAULTS['owner']![perm], true);
        assert.equal(ROLE_DEFAULTS['admin']![perm], true);
      }
    });

    it('restricts sensitive permissions for default user role', () => {
      const userDefaults = ROLE_DEFAULTS['user']!;
      assert.equal(userDefaults.create_post, true);
      assert.equal(userDefaults.publish_post, false);
      assert.equal(userDefaults.manage_users, false);
      assert.equal(userDefaults.view_billing, false);
    });
  });

  describe('resolvePermissions', () => {
    it('returns default permissions for user when no custom overrides provided', () => {
      const perms = resolvePermissions(ROLES.USER);
      assert.equal(perms.create_post, true);
      assert.equal(perms.publish_post, false);
    });

    it('applies custom permission overrides for user role', () => {
      const perms = resolvePermissions(ROLES.USER, {
        publish_post: true,
        view_billing: true,
      });
      assert.equal(perms.publish_post, true);
      assert.equal(perms.view_billing, true);
      assert.equal(perms.create_post, true);
    });

    it('ignores custom permission overrides for admin and owner roles', () => {
      const perms = resolvePermissions(ROLES.ADMIN, {
        publish_post: false,
      });
      assert.equal(perms.publish_post, true);
    });
  });

  describe('can() authorization check', () => {
    it('returns true for any permission if role is owner or admin', () => {
      const ownerUser: JwtUser = {
        dealer_user_id: 'usr_1',
        dealer_id: 'dlr_1',
        role: ROLES.OWNER,
        phone: '9999999999',
        permissions: {} as any,
      };

      const adminUser: JwtUser = {
        dealer_user_id: 'usr_2',
        dealer_id: 'dlr_1',
        role: ROLES.ADMIN,
        phone: '8888888888',
        permissions: {} as any,
      };

      assert.equal(can(ownerUser, PERMISSIONS.VIEW_BILLING), true);
      assert.equal(can(adminUser, PERMISSIONS.MANAGE_USERS), true);
    });

    it('respects user permissions map for user role', () => {
      const standardUser: JwtUser = {
        dealer_user_id: 'usr_3',
        dealer_id: 'dlr_1',
        role: ROLES.USER,
        phone: '7777777777',
        permissions: resolvePermissions(ROLES.USER),
      };

      assert.equal(can(standardUser, PERMISSIONS.CREATE_POST), true);
      assert.equal(can(standardUser, PERMISSIONS.PUBLISH_POST), false);
      assert.equal(can(standardUser, PERMISSIONS.VIEW_BILLING), false);
    });
  });
});
