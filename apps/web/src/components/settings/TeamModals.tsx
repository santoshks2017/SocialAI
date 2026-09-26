import { useState, type ChangeEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { ThemedSelect } from '../ui/ThemedSelect';
import type { Role } from '../../lib/permissions';
import type { TeamMember } from '../../services/users';
import { ROLE_DESCRIPTIONS, accountDraft, memberName, type AccountDraft } from '../../utils/team';
import { FieldLabel } from './SettingsParts';

type RoleOption = { value: Role; label: string };

export function InviteModal({ busy, roles, onClose, onInvite }: {
  busy: boolean;
  roles: RoleOption[];
  onClose: () => void;
  onInvite: (input: { phone: string; name: string; role: Role }) => void;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('user');
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Invite a team member"
      description="They'll get access to your dealership with the role you choose."
      size="md"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onInvite({ phone: phone.trim(), name: name.trim(), role })} disabled={!phone.trim() || busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Sending…' : 'Send invite'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="invite-phone">Phone number *</FieldLabel>
            <Input id="invite-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div>
            <FieldLabel htmlFor="invite-name">Name (optional)</FieldLabel>
            <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
          </div>
        </div>
        <div>
          <FieldLabel>Role</FieldLabel>
          <ThemedSelect value={role} onChange={(v) => setRole(v as Role)} options={roles} ariaLabel="Role" />
          <p className="text-xs text-zinc-500 mt-1.5">{ROLE_DESCRIPTIONS[role]}</p>
        </div>
      </div>
    </Modal>
  );
}

export function ChangeRoleModal({ member, roles, busy, onClose, onSave }: {
  member: TeamMember;
  roles: RoleOption[];
  busy: boolean;
  onClose: () => void;
  onSave: (role: Role) => void;
}) {
  const [role, setRole] = useState<Role>(member.role);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Change role"
      description={`Update the role for ${member.name?.trim() || member.phone}.`}
      size="sm"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onSave(role)} disabled={role === member.role || busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save role
          </Button>
        </>
      )}
    >
      <FieldLabel>Role</FieldLabel>
      <ThemedSelect value={role} onChange={(v) => setRole(v as Role)} options={roles} ariaLabel="Role" />
      <p className="text-xs text-zinc-500 mt-1.5">{ROLE_DESCRIPTIONS[role]}</p>
    </Modal>
  );
}

export function RemoveMemberModal({ member, busy, onClose, onConfirm }: {
  member: TeamMember;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const name = memberName(member);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Remove team member?"
      description={`${name} will lose access to this dealership immediately.`}
      variant="danger"
      size="sm"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Remove user
          </Button>
        </>
      )}
    >
      <p className="text-sm text-zinc-600">
        This will revoke all permissions for <strong className="text-zinc-900">{name}</strong> ({member.phone}). This action cannot be undone.
      </p>
    </Modal>
  );
}

// The reference edited email and password. Our accounts have no password: Google and Facebook sign-in find
// the account by its email (and phone OTP by its phone number), so an account is name, email and phone.
export function EditAccountModal({ member, busy, onClose, onSave }: {
  member: TeamMember;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: AccountDraft) => void;
}) {
  const [draft, setDraft] = useState<AccountDraft>(() => accountDraft(member));
  const who = member.name?.trim() || member.phone;
  const field = (key: keyof AccountDraft) => (e: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Edit member account"
      description={`Update ${who}'s name, email or phone number.`}
      size="sm"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-400">Google and Facebook sign-in use this email, so changing it changes how {member.name?.trim() || 'the user'} signs in.</p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={() => onSave(draft)} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-3">
        <div>
          <FieldLabel htmlFor="account-name">Name</FieldLabel>
          <Input id="account-name" value={draft.name} onChange={field('name')} placeholder="John Doe" />
        </div>
        <div>
          <FieldLabel htmlFor="account-email">Email</FieldLabel>
          <Input id="account-email" type="email" autoComplete="off" value={draft.email} onChange={field('email')} placeholder="name@company.com" />
        </div>
        <div>
          <FieldLabel htmlFor="account-phone">Phone number</FieldLabel>
          <Input id="account-phone" value={draft.phone} onChange={field('phone')} placeholder="+91 98765 43210" />
        </div>
      </div>
    </Modal>
  );
}
