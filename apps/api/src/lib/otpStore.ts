import { Redis } from "ioredis"

const REDIS_URL = process.env["REDIS_URL"]?.replace(/^["']|["']$/g, '');
const IS_VERCEL = process.env["VERCEL"] === "1"
const hasRedis = !IS_VERCEL && process.env['NODE_ENV'] !== 'test' && !!REDIS_URL

let _redis: Redis | null = null
const memoryOtpMap = new Map<string, string>()

function getRedis(): Redis | null {
  if (!hasRedis) return null
  if (!_redis) {
    _redis = new Redis(REDIS_URL!)
    // Prevent unhandled error events from crashing the process
    _redis.on("error", () => {})
  }
  return _redis
}

const OTP_PREFIX = "otp:"
const OTP_TTL_SECONDS = 600

export async function setOtp(phone: string, otp: string): Promise<void> {
  const r = getRedis()
  if (r) {
    await r.setex(`${OTP_PREFIX}${phone}`, OTP_TTL_SECONDS, otp)
  } else {
    memoryOtpMap.set(`${OTP_PREFIX}${phone}`, otp)
  }
}

export async function getOtp(phone: string): Promise<string | null> {
  const r = getRedis()
  if (!r) return memoryOtpMap.get(`${OTP_PREFIX}${phone}`) ?? null
  return r.get(`${OTP_PREFIX}${phone}`)
}

export async function deleteOtp(phone: string): Promise<void> {
  const r = getRedis()
  if (r) {
    await r.del(`${OTP_PREFIX}${phone}`)
  } else {
    memoryOtpMap.delete(`${OTP_PREFIX}${phone}`)
  }
}
