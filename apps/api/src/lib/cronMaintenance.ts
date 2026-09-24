import { syncFollowerSnapshots } from './followerSync.js';
import { syncGoogleReviews } from './gmbReviewSync.js';
import { classifyPendingMessages } from './inboxClassifier.js';
import { syncPostMetrics } from './metricsSync.js';

export interface MaintenanceCounts {
  classified: number;
  reviews: number;
  metrics: number;
  followers: number;
}

export interface MaintenanceLogger {
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export const MAINTENANCE_STEP_TIMEOUT_MS = 20_000;
export const HEAVY_TICK_EVERY_MINUTES = 10;

/** Post metrics and follower counts scan every published post or Meta connection, so they run every 10th minute. */
export function isHeavyTick(now: Date): boolean {
  return now.getUTCMinutes() % HEAVY_TICK_EVERY_MINUTES === 0;
}

async function step(name: string, run: () => Promise<number>, log: MaintenanceLogger, timeoutMs: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<number>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } catch (err) {
    log.error({ step: name, message: err instanceof Error ? err.message : String(err) }, '[cron] maintenance step failed');
    return 0;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Inbox and analytics upkeep for the every-minute cron: classify new messages, sync Google reviews,
 * then (every 10th minute) refresh post metrics and snapshot follower counts. Steps run one after
 * another; each is isolated and time-boxed, so none can fail or stall the publish sweep.
 */
export async function runMaintenance(now: Date, log: MaintenanceLogger, timeoutMs = MAINTENANCE_STEP_TIMEOUT_MS): Promise<MaintenanceCounts> {
  const classified = await step('classify', () => classifyPendingMessages(), log, timeoutMs);
  const reviews = await step('reviews', () => syncGoogleReviews(now), log, timeoutMs);
  const heavy = isHeavyTick(now);
  const metrics = heavy ? await step('metrics', () => syncPostMetrics(now), log, timeoutMs) : 0;
  const followers = heavy ? await step('followers', () => syncFollowerSnapshots(now), log, timeoutMs) : 0;
  return { classified, reviews, metrics, followers };
}
