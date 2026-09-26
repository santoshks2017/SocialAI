import { platformLabel } from './connections.js';

// publish_results[platform] stays a per-platform summary, so the readers written before accounts existed keep
// working (Posts links, analytics, metrics, inbox post matching). Per-account detail sits under `accounts`,
// keyed by PlatformConnection.id:
//   success (an account has the post): { post_id, url, published_at, accounts }  (first success in target order)
//   failure (none has it):             { error, failed_at, accounts? }         (no `accounts` when none was tried)
// Entries written before per-account publishing have no `accounts` map.

export interface AccountSuccess { account_name: string; post_id: string; url: string; published_at: string }
export interface AccountFailure { account_name: string; error: string; failed_at: string }
export type AccountEntry = AccountSuccess | AccountFailure;

export interface PlatformSummary {
  post_id?: string;
  url?: string;
  published_at?: string;
  error?: string;
  failed_at?: string;
  accounts?: Record<string, AccountEntry>;
}

export interface AccountOutcome {
  connection_id: string;
  account_name: string;
  success: boolean;
  post_id?: string;
  url?: string;
  error?: string;
}

export interface PlatformPublishResult {
  platform: string;
  success: boolean;
  post_id?: string;
  url?: string;
  error?: string;
  /** Each target account, when the platform had any: sent now, or already live from an earlier attempt. */
  accounts?: AccountOutcome[];
}

export interface PostRef {
  /** null for a result written before per-account publishing (the account is not recorded). */
  connection_id: string | null;
  post_id: string;
  url: string;
}

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function isSuccessfulResult(entry: unknown): boolean {
  return isObject(entry) && typeof entry['post_id'] === 'string' && !entry['error'];
}

const isAccountSuccess = (entry: AccountEntry | undefined): entry is AccountSuccess => !!entry && 'post_id' in entry;

/** The per-account map of a platform entry; empty for older entries. */
export function accountEntries(entry: unknown): Record<string, AccountEntry> {
  const out: Record<string, AccountEntry> = {};
  if (!isObject(entry) || !isObject(entry['accounts'])) return out;
  for (const [id, value] of Object.entries(entry['accounts'])) {
    if (!isObject(value)) continue;
    const account_name = text(value['account_name']);
    if (isSuccessfulResult(value)) {
      out[id] = { account_name, post_id: text(value['post_id']), url: text(value['url']), published_at: text(value['published_at']) };
    } else if (typeof value['error'] === 'string') {
      out[id] = { account_name, error: value['error'], failed_at: text(value['failed_at']) };
    }
  }
  return out;
}

/** A result written before per-account publishing that succeeded: that platform is done, as before. */
export function isLegacySuccess(entry: unknown): boolean {
  return isSuccessfulResult(entry) && !(isObject(entry) && isObject(entry['accounts']));
}

/** An account that already has the post, as an outcome; it is never sent again. */
export function storedOutcome(entry: unknown, connectionId: string): AccountOutcome | null {
  const account = accountEntries(entry)[connectionId];
  if (!isAccountSuccess(account)) return null;
  return { connection_id: connectionId, account_name: account.account_name, success: true, post_id: account.post_id, url: account.url };
}

function failureText(failures: AccountFailure[]): string {
  const [only] = failures;
  if (!only) return 'Unknown error';
  if (failures.length === 1) return only.error;
  return failures.map((f) => `${f.account_name}: ${f.error}`).join('; ');
}

/**
 * Merges this attempt's outcomes into a platform entry. A success is never replaced.
 * `order` lists the target connection ids, primary first. `platformError` is the failure text when
 * nothing could be tried (no connected account, or media the platform can't take).
 */
export function mergePlatformResult(
  entry: unknown,
  outcomes: readonly AccountOutcome[],
  order: readonly string[],
  at: string,
  platformError?: string,
): PlatformSummary {
  const accounts = accountEntries(entry);
  for (const o of outcomes) {
    if (isAccountSuccess(accounts[o.connection_id])) continue;
    accounts[o.connection_id] = o.success
      ? { account_name: o.account_name, post_id: o.post_id ?? '', url: o.url ?? '', published_at: at }
      : { account_name: o.account_name, error: o.error ?? 'Unknown error', failed_at: at };
  }
  const ids = [...order.filter((id) => id in accounts), ...Object.keys(accounts).filter((id) => !order.includes(id))];
  const first = ids.map((id) => accounts[id]).find(isAccountSuccess);
  if (first) return { post_id: first.post_id, url: first.url, published_at: first.published_at, accounts };
  const failures = ids.map((id) => accounts[id]).filter((a): a is AccountFailure => !!a && !isAccountSuccess(a));
  return { error: platformError ?? failureText(failures), failed_at: at, ...(ids.length > 0 ? { accounts } : {}) };
}

/** The API's per-platform result from a stored summary and this attempt's account outcomes. */
export function toPlatformResult(platform: string, summary: unknown, accounts: readonly AccountOutcome[] = []): PlatformPublishResult {
  const extra = accounts.length > 0 ? { accounts: [...accounts] } : {};
  if (isSuccessfulResult(summary)) {
    const s = summary as Loose;
    const url = text(s['url']);
    return { platform, success: true, post_id: text(s['post_id']), ...(url ? { url } : {}), ...extra };
  }
  const error = isObject(summary) && typeof summary['error'] === 'string' ? summary['error'] : 'Unknown error';
  return { platform, success: false, error, ...extra };
}

/** Names for the publish notification: "Facebook", or "Facebook (Page name)" per account when a platform had several. */
export function outcomeLabels(results: readonly PlatformPublishResult[]): { publishedOn: string[]; failedOn: string[] } {
  const publishedOn: string[] = [];
  const failedOn: string[] = [];
  for (const r of results) {
    const label = platformLabel(r.platform);
    const accounts = r.accounts ?? [];
    if (accounts.length > 1) {
      for (const a of accounts) (a.success ? publishedOn : failedOn).push(`${label} (${a.account_name})`);
    } else {
      (r.success ? publishedOn : failedOn).push(label);
    }
  }
  return { publishedOn, failedOn };
}

/** Every platform post a result holds: one per successful account, or the older top-level one. */
export function successfulPostRefs(entry: unknown): PostRef[] {
  const accounts = accountEntries(entry);
  const ids = Object.keys(accounts);
  if (ids.length > 0) {
    return ids.flatMap((id) => {
      const account = accounts[id];
      return isAccountSuccess(account) ? [{ connection_id: id, post_id: account.post_id, url: account.url }] : [];
    });
  }
  if (!isSuccessfulResult(entry)) return [];
  const e = entry as Loose;
  return [{ connection_id: null, post_id: text(e['post_id']), url: text(e['url']) }];
}
