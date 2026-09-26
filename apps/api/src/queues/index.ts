import { Queue } from 'bullmq';
import type { PublishDirectData } from '../lib/publishDirect.js';

const REDIS_URL = process.env['REDIS_URL']?.replace(/^["']|["']$/g, '');
// Only create queues if Redis is configured and we're not in test mode
// (without Redis, /v1/cron/publish handles scheduled jobs instead)
const hasRedis = process.env['NODE_ENV'] !== 'test' && !!REDIS_URL;

export const redisConnection = hasRedis
  ? {
      host: REDIS_URL!.replace(/^redis:\/\//, '').split(':')[0] ?? 'localhost',
      port: parseInt(REDIS_URL!.split(':')[2] ?? '6379'),
    }
  : { host: 'localhost', port: 6379 };

export function isQueueAvailable(): boolean {
  return hasRedis;
}

// ─── Queues ────────────────────────────────────────────────────────────────────

export const publishQueue = hasRedis ? new Queue('publish', { connection: redisConnection }) : null;
export const metricsQueue = hasRedis ? new Queue('metrics', { connection: redisConnection }) : null;
export const inboxPollQueue = hasRedis ? new Queue('inbox-poll', { connection: redisConnection }) : null;
export const captionQueue = hasRedis ? new Queue('caption', { connection: redisConnection }) : null;

// ─── Job type definitions ──────────────────────────────────────────────────────

/** One publish job: one post to one account (lib/publishDirect.ts). */
export type PublishJobData = PublishDirectData;

export interface MetricsJobData {
  post_id: string;
  dealer_id: string;
  platform: 'facebook' | 'instagram' | 'gmb';
  platform_post_id: string;
  access_token: string;
}

export interface InboxPollJobData {
  dealer_id: string;
  platform: 'facebook' | 'instagram' | 'google';
  platform_account_id: string;
  access_token: string;
}

export interface CaptionJobData {
  generation_id: string;
  dealer_id: string;
  prompt: string;
  dealer_context: {
    name: string;
    city: string;
    brands: string[];
    phone: string;
    whatsapp: string;
    language_preferences: string[];
  };
  inventory_context?: {
    make?: string;
    model?: string;
    variant?: string;
    price?: number;
    features?: string[];
    stock_count?: number;
  };
}

