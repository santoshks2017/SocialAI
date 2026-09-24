import api from './api';

export type TrackedAction = 'caption.accepted' | 'caption.edited' | 'caption.rejected' | 'report.downloaded' | 'platform.notify_requested';

/** Records a usage event (POST /v1/events). Fire-and-forget: failures are ignored. */
export function trackEvent(action: TrackedAction, meta: Record<string, string | number | boolean> = {}): void {
  api.post('/events', { ...meta, action }).catch(() => {});
}
