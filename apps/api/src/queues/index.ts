import { Queue } from 'bullmq';

const REDIS_URL = process.env['REDIS_URL']?.replace(/^["']|["']$/g, '');
const IS_VERCEL = process.env['VERCEL'] === '1';

// Only create queues if Redis is configured and we're not on Vercel serverless or in test mode
// (Vercel has no persistent process to drain queues — cron handles scheduled jobs instead)
const hasRedis = !IS_VERCEL && process.env['NODE_ENV'] !== 'test' && !!REDIS_URL;

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

export interface PublishJobData {
  post_id: string;
  dealer_id: string;
  platform: 'facebook' | 'instagram' | 'gmb';
  image_url: string;
  caption: string;
  page_id?: string;
  ig_user_id?: string;
  gmb_location_name?: string;
  access_token: string;
  dealer_phone?: string;
  dealer_whatsapp?: string;
}

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

