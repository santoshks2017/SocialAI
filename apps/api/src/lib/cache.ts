import { Redis } from 'ioredis';

const REDIS_URL = process.env['REDIS_URL'];
const IS_VERCEL = process.env['VERCEL'] === '1';
const hasRedis = !IS_VERCEL && !!REDIS_URL;

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!hasRedis) return null;
  if (!_redis) {
    _redis = new Redis(REDIS_URL!);
    _redis.on('error', () => {});
  }
  return _redis;
}

const memoryCache = new Map<string, { val: any; expiresAt: number }>();

/**
 * Retrieves a value from the cache. Falls back to in-memory cache if Redis is not configured or fails.
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (r) {
    try {
      const val = await r.get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch (err) {
      console.warn('Redis getCache failed, falling back to memory:', err);
    }
  }

  const inMemory = memoryCache.get(key);
  if (inMemory) {
    if (inMemory.expiresAt > Date.now()) {
      return inMemory.val as T;
    }
    memoryCache.delete(key);
  }
  return null;
}

/**
 * Sets a value in the cache with a specified TTL. Falls back to in-memory cache if Redis is not configured or fails.
 */
export async function setCache(key: string, value: any, ttlSeconds = 86400): Promise<void> {
  const r = getRedis();
  if (r) {
    try {
      await r.setex(key, ttlSeconds, JSON.stringify(value));
      return;
    } catch (err) {
      console.warn('Redis setCache failed, falling back to memory:', err);
    }
  }

  memoryCache.set(key, {
    val: value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}
export { hasRedis };
