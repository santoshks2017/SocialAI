import { LoaderCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { ConnectedAccount } from '../../utils/accounts';

interface DisconnectModalProps {
  account: ConnectedAccount | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DisconnectModal({ account, busy, onClose, onConfirm }: DisconnectModalProps) {
  return (
    <Modal
      isOpen={account !== null}
      onClose={busy ? () => {} : onClose}
      title="Disconnect this account?"
      size="sm"
      variant="danger"
      closeOnOverlayClick={!busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Keep connected</Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>
            {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
            Disconnect
          </Button>
        </>
      }
    >
      <p className="text-sm text-zinc-600">
        This will remove <strong className="font-semibold text-zinc-900">{account?.accountName}</strong> from Social AI. Any scheduled posts for this account will fail to publish.
      </p>
      <p className="text-xs text-zinc-400 mt-3">You can reconnect at any time from the Accounts page.</p>
    </Modal>
  );
}
