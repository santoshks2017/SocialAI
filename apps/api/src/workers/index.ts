import { isQueueAvailable } from '../queues/index.js';
import { startPublishWorker } from './publishWorker.js';
import { startMetricsWorker } from './metricsWorker.js';

interface WorkerLogger {
  info(msg: string): void;
}

// BullMQ workers need Redis. Without REDIS_URL (e.g. on Cloud Run) they would
// retry localhost:6379 forever, so skip them — /v1/cron/publish, triggered by
// Cloud Scheduler, publishes scheduled posts instead.
export function startWorkers(
  log: WorkerLogger,
  queueAvailable = isQueueAvailable(),
  starters: Array<() => unknown> = [startPublishWorker, startMetricsWorker],
): boolean {
  if (!queueAvailable) {
    log.info('REDIS_URL not set — skipping BullMQ workers; scheduled posts are published via /v1/cron/publish');
    return false;
  }
  for (const start of starters) start();
  return true;
}
