import { LoaderCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { markAllDescription } from '../../utils/inbox';

interface MarkAllReadModalProps {
  open: boolean;
  count: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function MarkAllReadModal({ open, count, busy, onClose, onConfirm }: MarkAllReadModalProps) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="sm"
      title="Mark all as read?"
      description={markAllDescription(count)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
            Mark all read
          </Button>
        </>
      }
    >
      <p className="text-sm text-zinc-600">Unread indicators will be cleared for all messages in your inbox.</p>
    </Modal>
  );
}
