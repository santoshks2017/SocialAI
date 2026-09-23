import { createHash, createHmac, timingSafeEqual } from "crypto"
import { Timestamp, type DocumentData } from "@google-cloud/firestore"
import { firestore, isUsingMemoryStore } from "../db/firestore.js"

// One-time login codes. They live in Firestore because Cloud Run runs several
// instances and /otp/verify may land on a different one than /otp/send. Only an
// HMAC of the code is stored; a plain hash of six digits is trivially reversible.

export const OTP_TTL_SECONDS = 600
export const OTP_MAX_ATTEMPTS = 5
// Codes sent to one phone/email per OTP_TTL_SECONDS window (caps SMS spend).
export const OTP_MAX_SENDS = 5

const COLLECTION = "otp_codes"

interface OtpEntry {
  otp_hash: string
  attempts: number
  sends: number
  window_started_at: number
  expires_at: number
}

const memory = new Map<string, OtpEntry>()

function docId(key: string): string {
  return createHash("sha256").update(`otp:${key}`).digest("hex")
}

function hashOtp(key: string, otp: string): string {
  return createHmac("sha256", process.env["JWT_SECRET"] ?? "").update(`otp:${key}:${otp}`).digest("hex")
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex")
  const y = Buffer.from(b, "hex")
  return x.length === y.length && timingSafeEqual(x, y)
}

function nextEntry(key: string, otp: string, prev: OtpEntry | undefined): OtpEntry | null {
  const now = Date.now()
  const inWindow = !!prev && now < prev.window_started_at + OTP_TTL_SECONDS * 1000
  if (inWindow && prev.sends >= OTP_MAX_SENDS) return null
  return {
    otp_hash: hashOtp(key, otp),
    attempts: 0,
    sends: inWindow ? prev.sends + 1 : 1,
    window_started_at: inWindow ? prev.window_started_at : now,
    expires_at: now + OTP_TTL_SECONDS * 1000,
  }
}

function fromDoc(data: DocumentData | undefined): OtpEntry | undefined {
  if (!data) return undefined
  return {
    otp_hash: data["otp_hash"],
    attempts: data["attempts"] ?? 0,
    sends: data["sends"] ?? 0,
    window_started_at: data["window_started_at"] ?? 0,
    expires_at: (data["expires_at"] as Timestamp).toMillis(),
  }
}

/** Stores a new code for `key`, replacing any earlier one. False when too many codes were sent recently. */
export async function storeOtp(key: string, otp: string): Promise<boolean> {
  if (isUsingMemoryStore()) {
    const entry = nextEntry(key, otp, memory.get(key))
    if (!entry) return false
    memory.set(key, entry)
    return true
  }
  const ref = firestore.collection(COLLECTION).doc(docId(key))
  return firestore.runTransaction(async (tx) => {
    const entry = nextEntry(key, otp, fromDoc((await tx.get(ref)).data()))
    if (!entry) return false
    // Timestamp so a Firestore TTL policy on expires_at can clear old codes.
    tx.set(ref, { ...entry, expires_at: Timestamp.fromMillis(entry.expires_at) })
    return true
  })
}

export type OtpCheck = "valid" | "invalid" | "locked"

// "locked" means this was the last allowed attempt: the code is burned and the
// user has to request a new one.
function check(key: string, otp: string, entry: OtpEntry | undefined): { result: OtpCheck; next: OtpEntry | null } {
  if (!entry || entry.expires_at <= Date.now() || entry.attempts >= OTP_MAX_ATTEMPTS) {
    return { result: "invalid", next: null }
  }
  if (sameHash(entry.otp_hash, hashOtp(key, otp))) return { result: "valid", next: null }
  const attempts = entry.attempts + 1
  if (attempts >= OTP_MAX_ATTEMPTS) return { result: "locked", next: { ...entry, attempts } }
  return { result: "invalid", next: { ...entry, attempts } }
}

/** Checks `otp` against the stored code. A valid code is consumed; each wrong guess counts toward the limit. */
export async function verifyOtp(key: string, otp: string): Promise<OtpCheck> {
  if (isUsingMemoryStore()) {
    const { result, next } = check(key, otp, memory.get(key))
    if (next) memory.set(key, next)
    else if (result === "valid") memory.delete(key)
    return result
  }
  const ref = firestore.collection(COLLECTION).doc(docId(key))
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const { result, next } = check(key, otp, fromDoc(snap.data()))
    // A burned code keeps its doc (attempts at the limit) so the send window still applies.
    if (next) tx.update(ref, { attempts: next.attempts })
    else if (result === "valid") tx.delete(ref)
    return result
  })
}
