export const EVENT_ACTIONS = ['caption.accepted', 'caption.edited', 'caption.rejected', 'report.downloaded', 'platform.notify_requested'] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];
export type EventMeta = Record<string, string | number | boolean>;

export const EVENT_TTL_DAYS = 365;
export const EVENT_META_MAX_KEYS = 10;
export const EVENT_META_MAX_STRING = 200;

const META_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

export function isEventAction(value: unknown): value is EventAction {
  return typeof value === 'string' && (EVENT_ACTIONS as readonly string[]).includes(value);
}

/** The body's other top-level fields as meta: strings up to 200 characters, finite numbers and booleans, at most 10. */
export function eventMeta(fields: Record<string, unknown>): { ok: true; meta: EventMeta } | { ok: false; message: string } {
  const entries = Object.entries(fields);
  if (entries.length > EVENT_META_MAX_KEYS) return { ok: false, message: `At most ${EVENT_META_MAX_KEYS} extra fields are allowed` };
  const meta: EventMeta = {};
  for (const [key, value] of entries) {
    if (!META_KEY.test(key)) return { ok: false, message: 'Field names must be letters, digits or _' };
    if (typeof value === 'string' && value.length <= EVENT_META_MAX_STRING) meta[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) meta[key] = value;
    else if (typeof value === 'boolean') meta[key] = value;
    else return { ok: false, message: `${key} must be a short string, a number or true/false` };
  }
  return { ok: true, meta };
}
