export interface VideoJobState {
  status: 'queued' | 'processing' | 'ready' | 'failed';
  video_url: string | null;
  error: { code: string; message: string } | null;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  isCancelled?: () => boolean;
  /** A status request error that means the job is gone (e.g. 403/404): stop instead of retrying. */
  isFatal?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type PollOutcome<T> =
  | { kind: 'ready'; job: T }
  | { kind: 'failed'; job: T }
  | { kind: 'timeout' }
  | { kind: 'cancelled' }
  | { kind: 'missing' };

/** Polls a reel job until it is ready or failed. Failed status requests are retried until the timeout unless fatal. */
export async function waitForVideoJob<T extends VideoJobState>(fetchStatus: () => Promise<T>, options: PollOptions = {}): Promise<PollOutcome<T>> {
  const intervalMs = options.intervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 8 * 60_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const started = now();
  while (now() - started < timeoutMs) {
    if (options.isCancelled?.()) return { kind: 'cancelled' };
    try {
      const job = await fetchStatus();
      // The caller may have gone away while the request was in flight.
      if (options.isCancelled?.()) return { kind: 'cancelled' };
      if (job.status === 'ready' && job.video_url) return { kind: 'ready', job };
      if (job.status === 'failed') return { kind: 'failed', job };
    } catch (err) {
      if (options.isCancelled?.()) return { kind: 'cancelled' };
      if (options.isFatal?.(err)) return { kind: 'missing' };
      // Otherwise a status request failing (network blip, deploy) doesn't mean the render failed.
    }
    await sleep(intervalMs);
  }
  return { kind: 'timeout' };
}
