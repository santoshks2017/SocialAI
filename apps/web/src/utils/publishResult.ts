// Interprets POST /v1/publisher/publish responses. Tolerates both the original
// shape ({ status, job_ids, skipped_platforms }) and per-platform `results`.

type ErrorLike = string | { message?: string } | null | undefined;

export interface PublishPlatformResult {
  platform?: string;
  success?: boolean;
  status?: string;
  post_id?: string;
  url?: string;
  error?: ErrorLike;
  message?: string;
}

export interface PublishResponse {
  success?: boolean;
  status?: string;
  job_ids?: string[];
  skipped_platforms?: string[];
  scheduled_at?: string | null;
  results?: PublishPlatformResult[] | Record<string, PublishPlatformResult>;
  failed_platforms?: string[];
  error?: ErrorLike;
  message?: string;
}

export interface PublishOutcome {
  ok: boolean;
  // Error text when !ok; a partial-failure warning (or null) when ok.
  message: string | null;
}

const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  gmb: 'Google Business',
  google: 'Google Business',
};

export function platformName(platform: string): string {
  return PLATFORM_NAMES[platform] ?? platform;
}

function errorText(err: ErrorLike): string | null {
  if (!err) return null;
  if (typeof err === 'string') return err;
  return typeof err.message === 'string' && err.message ? err.message : null;
}

function normalizeResults(results: PublishResponse['results']): PublishPlatformResult[] {
  if (!results) return [];
  if (Array.isArray(results)) return results;
  return Object.entries(results).map(([platform, r]) => ({ platform, ...r }));
}

function isFailed(r: PublishPlatformResult): boolean {
  return r.success === false || r.status === 'failed' || r.status === 'error';
}

function describeFailures(failed: PublishPlatformResult[]): string | null {
  const parts = failed.map((r) => {
    const reason = errorText(r.error) ?? r.message;
    const name = r.platform ? platformName(r.platform) : 'A platform';
    return reason ? `${name}: ${reason}` : `${name} failed`;
  });
  return parts.length ? parts.join('; ') : null;
}

export function summarizePublishResult(res: PublishResponse | null | undefined, requested: string[]): PublishOutcome {
  if (!res) return { ok: false, message: 'No response from the server.' };

  const results = normalizeResults(res.results);
  const failedInResults = results.filter(isFailed);
  const reported = new Set(failedInResults.map((r) => r.platform));
  const failed = [
    ...failedInResults,
    ...(res.failed_platforms ?? []).filter((p) => !reported.has(p)).map((platform) => ({ platform, success: false })),
  ];
  const skipped = res.skipped_platforms ?? [];

  if (res.success === false || res.status === 'failed') {
    return {
      ok: false,
      message: errorText(res.error) ?? res.message ?? describeFailures(failed) ?? 'Publishing failed on all platforms.',
    };
  }

  if (results.length > 0 && failedInResults.length === results.length) {
    return { ok: false, message: describeFailures(failed) ?? 'Publishing failed on all platforms.' };
  }

  const nothingQueued = results.length === 0 && !(res.job_ids?.length);
  if (nothingQueued && requested.length > 0 && requested.every((p) => skipped.includes(p))) {
    return {
      ok: false,
      message: `No connected account for ${requested.map(platformName).join(', ')}. Connect it on the Accounts page and try again.`,
    };
  }

  const warnings: string[] = [];
  const failureText = describeFailures(failed);
  if (failureText) warnings.push(failureText);
  if (skipped.length) warnings.push(`Skipped (not connected): ${skipped.map(platformName).join(', ')}`);
  return { ok: true, message: warnings.length ? warnings.join('. ') : null };
}

// Message for a thrown publish error. A 502 PUBLISH_FAILED carries the publish body
// (per-platform results) in ApiError.data; add any failure the message doesn't mention.
export function publishErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const base = err.message || fallback;
  const data = (err as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return base;
  const unmentioned = normalizeResults((data as PublishResponse).results)
    .filter(isFailed)
    .filter((r) => {
      const reason = errorText(r.error) ?? r.message;
      return !reason || !base.includes(reason);
    });
  const extra = describeFailures(unmentioned);
  return extra ? `${base} ${extra}` : base;
}
