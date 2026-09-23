import { CalendarClock, Check, LoaderCircle, Send } from 'lucide-react';
import { Button } from '../ui/Button';
import type { CreateType } from '../../utils/createStudio';

interface PublishActionsProps {
  type: CreateType;
  canPublish: boolean;
  disabled: boolean;
  limitBlocked: boolean;
  busy: boolean;
  onPublish: () => void;
  onSchedule: () => void;
  onApproval: () => void;
}

export function PublishActions({ type, canPublish, disabled, limitBlocked, busy, onPublish, onSchedule, onApproval }: PublishActionsProps) {
  const off = disabled || limitBlocked || busy;
  const title = limitBlocked ? 'Caption or hashtags exceed a platform limit' : undefined;
  const spinner = busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : null;

  if (!canPublish) {
    return (
      <div className="space-y-2">
        <Button className="w-full" onClick={onApproval} disabled={off} title={title}>
          {spinner ?? <Check className="w-4 h-4" />} Send for approval
        </Button>
        <p className="text-[11px] text-zinc-500">You don't have permission to publish. Send the post for approval and your approver will be notified.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={onPublish} disabled={off} title={title}>
        {spinner ?? <Send className="w-4 h-4" />} {type === 'reel' ? 'Publish reel' : 'Publish everywhere'}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onSchedule} disabled={off} title={title}>
          <CalendarClock className="w-4 h-4" /> Schedule
        </Button>
        <Button variant="secondary" onClick={onApproval} disabled={off} title={title}>
          <Check className="w-4 h-4" /> Approval
        </Button>
      </div>
    </div>
  );
}
