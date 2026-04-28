import { Redis } from "ioredis"

const REDIS_URL = process.env["REDIS_URL"]
const IS_VERCEL = process.env["VERCEL"] === "1"
const hasRedis = !IS_VERCEL && !!REDIS_URL

let _redis: Redis | null = null

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
  if (r) await r.setex(`${OTP_PREFIX}${phone}`, OTP_TTL_SECONDS, otp)
  // Without Redis on Vercel the OTP can't be stored server-side;
  // the dev bypass (code "1234") still works.
}

export async function getOtp(phone: string): Promise<string | null> {
  const r = getRedis()
  if (!r) return null
  return r.get(`${OTP_PREFIX}${phone}`)
}

export async function deleteOtp(phone: string): Promise<void> {
  const r = getRedis()
  if (r) await r.del(`${OTP_PREFIX}${phone}`)
}
