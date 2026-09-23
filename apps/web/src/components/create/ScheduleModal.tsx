import { useState } from 'react';
import { CalendarClock, LoaderCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { toLocalInput } from '../../utils/posts';
import { FIELD_CLASS, LABEL_CLASS } from './fieldStyles';

interface ScheduleModalProps {
  open: boolean;
  initialValue: string;
  busy: boolean;
  onClose: () => void;
  onSchedule: (localValue: string) => void;
}

export function ScheduleModal({ open, ...rest }: ScheduleModalProps) {
  if (!open) return null;
  return <ScheduleForm {...rest} />;
}

function ScheduleForm({ initialValue, busy, onClose, onSchedule }: Omit<ScheduleModalProps, 'open'>) {
  const [value, setValue] = useState(initialValue);
  const [min] = useState(() => toLocalInput(new Date()));
  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} title="Schedule post" size="sm" closeOnOverlayClick={!busy}>
      <div className="space-y-4">
        <div>
          <label htmlFor="schedule-at" className={LABEL_CLASS}>Date &amp; time (IST)</label>
          <input id="schedule-at" type="datetime-local" value={value} min={min} onChange={(e) => setValue(e.target.value)} className={FIELD_CLASS} />
        </div>
        <Button className="w-full" onClick={() => onSchedule(value)} disabled={!value || busy}>
          {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} Schedule
        </Button>
      </div>
    </Modal>
  );
}
