export interface VideoJobState {
  status: 'queued' | 'processing' | 'ready' | 'failed';
  video_url: string | null;
  error: { code: string; message: string } | null;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  isCancelled?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type PollOutcome<T> = { kind: 'ready'; job: T } | { kind: 'failed'; job: T } | { kind: 'timeout' } | { kind: 'cancelled' };

/** Polls a reel job until it is ready or failed. Failed status requests are retried until the timeout. */
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
      if (job.status === 'ready' && job.video_url) return { kind: 'ready', job };
      if (job.status === 'failed') return { kind: 'failed', job };
    } catch {
      // A status request failing (network blip, deploy) doesn't mean the render failed.
    }
    await sleep(intervalMs);
  }
  return { kind: 'timeout' };
}
